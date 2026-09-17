// netlify/lib/analytics-hit.mjs — the beacon handler behind POST /api/hit, as a
// factory so the edge entry (netlify/edge-functions/hit.js) hands it the real
// Netlify Blobs store and the tests hand it a memory one. Web-standard only, so
// Deno (the edge runtime) and Node (the tests) run the same file.
//
// Every answer is 204 with no body and no cookie: the beacon is fire-and-forget,
// a visitor never waits on it and never learns from it. A hit is DROPPED (204,
// nothing written) when:
//   · the method is not POST                       · the browser sends Sec-GPC: 1
//   · the request is a prefetch or prerender        · the user agent is empty or a bot's
//   · the Origin (or Referer) host is not this host · the path is unusable or private
// Nothing that identifies the visitor leaves this function: the IP and the user
// agent go into the day's salted hash and are then forgotten.
import { DEFAULT_TZ, countryCode, deviceClass, hostOf, isBot, localParts, normalizePath, randomHex, rawKey, refHost, saltKey, storeNameFor, visitorHash } from './analytics-core.mjs';

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** the day's salt: created by the first hit of the day (onlyIfNew), read back by
 *  everyone else with a strong read, remembered per isolate for the rest of the day */
async function saltFor(store, day, cache, log) {
  const cached = cache.get(day);
  if (cached) return cached;
  const fresh = randomHex(32);
  let salt = fresh;
  try {
    const r = await store.set(saltKey(day), fresh, { onlyIfNew: true });
    if (!r || r.modified === false) {
      const existing = await store.get(saltKey(day), { type: 'text', consistency: 'strong' });
      if (existing) salt = String(existing).trim();
      else if (r) log('salt: existed but could not be read; using a fresh one for this isolate');
    }
  } catch (e) {
    log(`salt: ${e.message}; using a fresh one for this isolate`);
  }
  cache.clear(); // one day at a time — yesterday's salt has no further use here
  cache.set(day, salt);
  return salt;
}

/**
 * createHandler({ getStore, env, now, log }) → async (request, context) → Response
 *   getStore(name)  the Netlify Blobs store (set / get / setJSON); name follows the deploy context
 *   env.get(name)   ANALYTICS_TZ (default America/Chicago)
 *   now()           milliseconds (tests pin it)
 *   log(text)       edge function log; nothing about a visitor is ever logged
 */
export function createHandler({ getStore, env = { get: () => undefined }, now = () => Date.now(), log = () => {} } = {}) {
  if (typeof getStore !== 'function') throw new Error('createHandler needs getStore(name)');
  const salts = new Map();
  return async function hit(req, context = {}) {
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
    const h = req.headers;
    if (h.get('sec-gpc') === '1') return noContent();
    if (/prefetch|prerender/i.test(h.get('sec-purpose') || h.get('purpose') || '')) return noContent();
    const ua = h.get('user-agent') || '';
    if (isBot(ua)) return noContent();
    const host = hostOf(req.url);
    const from = hostOf(h.get('origin')) || hostOf(h.get('referer'));
    if (!host || !from || from !== host) return noContent();
    let body;
    try { body = JSON.parse(await req.text()); } catch { return noContent(); }
    if (!body || typeof body !== 'object') return noContent();
    const path = normalizePath(body.p);
    if (!path) return noContent();

    const tz = env.get('ANALYTICS_TZ') || DEFAULT_TZ;
    const ts = now();
    const { day, hour } = localParts(ts, tz);
    try {
      const store = getStore(storeNameFor(context?.deploy?.context));
      const salt = await saltFor(store, day, salts, log);
      const ip = context?.ip || h.get('x-nf-client-connection-ip') || '';
      const rec = {
        d: day, h: hour, p: path,
        r: refHost(body.r, host),
        c: countryCode(context?.geo?.country?.code),
        v: deviceClass(body.w),
        u: await visitorHash(salt, host, ip, ua),
        t: new Date(ts).toISOString(),
      };
      await store.setJSON(rawKey(day, ts, randomHex(3)), rec);
    } catch (e) {
      log(`hit: not recorded (${e.message})`);
    }
    return noContent();
  };
}
