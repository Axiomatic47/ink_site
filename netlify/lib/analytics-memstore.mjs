// netlify/lib/analytics-memstore.mjs — an in-memory stand-in for a Netlify Blobs
// store with the exact surface the counter uses (set with onlyIfNew / onlyIfMatch
// returning { modified, etag }, get by type, getWithMetadata, setJSON, delete, list
// with prefix). Web-standard only: the Node tests and the Deno test both use it,
// and analytics-store.mjs opens it as the local store outside Netlify.
export function memoryBlobs() {
  const m = new Map(); // key → { data: string, etag: string }
  let n = 0;
  const etagOf = () => `"m${(++n).toString(36)}"`;
  const write = (key, data, opts = {}) => {
    const cur = m.get(key);
    if (opts.onlyIfNew && cur) return { modified: false, etag: cur.etag };
    if (opts.onlyIfMatch !== undefined && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false, etag: cur?.etag };
    const etag = etagOf();
    m.set(key, { data: typeof data === 'string' ? data : JSON.stringify(data), etag });
    return { modified: true, etag };
  };
  return {
    kind: 'memory',
    async set(key, data, opts) { return write(key, String(data), opts); },
    async setJSON(key, obj, opts) { return write(key, JSON.stringify(obj), opts); },
    async get(key, opts = {}) {
      const cur = m.get(key);
      if (!cur) return null;
      return opts.type === 'json' ? JSON.parse(cur.data) : cur.data;
    },
    async getWithMetadata(key, opts = {}) {
      const cur = m.get(key);
      if (!cur) return null;
      return { data: opts.type === 'json' ? JSON.parse(cur.data) : cur.data, etag: cur.etag, metadata: {} };
    },
    async delete(key) { m.delete(key); },
    async list({ prefix = '' } = {}) {
      const blobs = [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key, etag: m.get(key).etag }));
      return { blobs, directories: [] };
    },
    /** test helpers */
    _size() { return m.size; },
    _keys() { return [...m.keys()].sort(); },
  };
}
