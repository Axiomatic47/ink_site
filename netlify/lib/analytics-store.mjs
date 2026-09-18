// netlify/lib/analytics-store.mjs — the counter's store as the rollup and the
// console see it: JSON values with etags, conditional writes, prefix listing.
//
//   raw/<day>/<ts>-<rand>   one page view (written by the edge function, deleted by the rollup)
//   salt/<day>              the day's random salt (written by the edge function, deleted at day close)
//   day/<day>.json          the day's aggregate: views, uniques, paths, refs, countries, devices, hours
//   lock/rollup             the rollup's lock (onlyIfNew; a lock older than two minutes is taken over)
//   meta/last-rollup        the last rollup's summary, shown on the console
//
// WHERE IT LIVES — the same rule as readings-store.mjs: in a Netlify function
// Blobs, always, through the runtime's own credentials (an error is rethrown, never
// a silent fallback); in a Netlify build Blobs when the context allows; anywhere
// else (tests, local dev) a process-wide memory store. The store's NAME follows
// the deploy context (analytics-core.mjs storeNameFor): production writes
// `analytics`, a branch deploy `analytics-branch-deploy`, a preview
// `analytics-deploy-preview` — one site-wide Blobs namespace, three separate books.
import { blobsClient, inBuild, inFunction } from './readings-store.mjs';
import { memoryBlobs } from './analytics-memstore.mjs';
import { storeNameFor } from './analytics-core.mjs';

/** { kind, get, getWithEtag, set(key, obj, {onlyIfNew|onlyIfMatch}) → {modified, etag}, del, list(prefix) → keys[] } */
export const wrapBlobs = (s, kind = 'blobs') => ({
  kind,
  async get(key) { return (await s.get(key, { type: 'json' })) ?? null; },
  async getWithEtag(key) {
    const r = await s.getWithMetadata(key, { type: 'json' });
    return r ? { value: r.data, etag: r.etag } : null;
  },
  async set(key, obj, opts = {}) {
    const r = await s.setJSON(key, obj, opts);
    // an older client returns nothing from set(): treat the write as done, unconditionally
    return r && typeof r.modified === 'boolean' ? r : { modified: true, etag: r?.etag };
  },
  async del(key) { await s.delete(key); },
  async list(prefix) {
    const { blobs } = await s.list({ prefix });
    return blobs.map(b => b.key);
  },
});

let memory = null;
/** the process-wide memory store (tests, local dev); a new one on demand for an isolated test */
export function memoryStore(fresh = false) {
  if (fresh) return wrapBlobs(memoryBlobs(), 'memory');
  memory ??= memoryBlobs();
  return wrapBlobs(memory, 'memory');
}

export async function openAnalyticsStore({ deployContext } = {}) {
  const name = storeNameFor(deployContext ?? process.env.CONTEXT);
  if (inFunction()) return wrapBlobs(await blobsClient(name), `blobs:${name}`); // throws with a plain message if unconfigured
  if (inBuild()) {
    try { return wrapBlobs(await blobsClient(name), `blobs:${name}`); }
    catch (e) { console.warn(`analytics-store: WARNING — Netlify build without Blobs access (${e.message}); using an empty memory store.`); }
  }
  return memoryStore();
}
