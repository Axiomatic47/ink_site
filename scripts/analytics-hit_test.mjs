// scripts/analytics-hit_test.mjs — the beacon handler under DENO, the edge
// runtime that will run it:  deno test scripts/analytics-hit_test.mjs
// The Node suite (scripts/test-analytics.mjs) is the full proof; this one shows
// the same module loads and behaves under the other engine (Intl with a time
// zone, crypto.subtle, Request/Response), with no import map and no permissions.
import { createHandler } from '../netlify/lib/analytics-hit.mjs';
import { memoryBlobs } from '../netlify/lib/analytics-memstore.mjs';
import { localParts, normalizePath, storeNameFor } from '../netlify/lib/analytics-core.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const SITE = 'https://kirchner.ink';
const T0 = Date.UTC(2026, 8, 16, 15, 0, 0);
const req = (body, headers = {}) => new Request(`${SITE}/api/hit`, { method: 'POST', headers: { 'user-agent': UA, origin: SITE, ...headers }, body: JSON.stringify(body) });
const ctx = { ip: '203.0.113.9', geo: { country: { code: 'US' } }, deploy: { context: 'production' } };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

Deno.test('a page view is recorded with the owner-zone day and hour', async () => {
  const blobs = memoryBlobs();
  const hit = createHandler({ getStore: () => blobs, env: { get: () => 'America/Chicago' }, now: () => T0 });
  const r = await hit(req({ p: '/bio?x#y', r: 'https://duckduckgo.com/', w: 1440 }), ctx);
  eq(r.status, 204, 'status');
  const keys = blobs._keys().filter(k => k.startsWith('raw/'));
  eq(keys.length, 1, 'one raw');
  const rec = await blobs.get(keys[0], { type: 'json' });
  eq([rec.d, rec.h, rec.p, rec.r, rec.c, rec.v, rec.u.length], ['2026-09-16', 10, '/bio', 'duckduckgo.com', 'US', 'desktop', 16], 'record');
});

Deno.test('GPC, bots and foreign origins are dropped', async () => {
  const blobs = memoryBlobs();
  const hit = createHandler({ getStore: () => blobs, now: () => T0 });
  await hit(req({ p: '/', w: 1200 }, { 'sec-gpc': '1' }), ctx);
  await hit(req({ p: '/', w: 1200 }, { 'user-agent': 'curl/8.4' }), ctx);
  await hit(req({ p: '/', w: 1200 }, { origin: 'https://evil.example' }), ctx);
  eq(blobs._size(), 0, 'nothing written');
});

Deno.test('core helpers agree with the Node suite', () => {
  eq(normalizePath('/work/x/review.html?v=1'), '/work/x/review', 'path');
  eq(normalizePath('/admin/x'), null, 'private');
  eq(storeNameFor('branch-deploy'), 'analytics-branch-deploy', 'store');
  eq(localParts(Date.UTC(2026, 8, 16, 4, 30), 'America/Chicago'), { day: '2026-09-15', hour: 23 }, 'zone');
});
