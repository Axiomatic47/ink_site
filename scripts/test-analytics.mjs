#!/usr/bin/env node
// scripts/test-analytics.mjs — the counter's proof, runnable anywhere:
//   node scripts/test-analytics.mjs        (npm run test:analytics)
// Exercises the beacon handler (what is dropped, what is written, what a record
// holds), the day's salt, the roll-up (fold, idempotence, the lock, the
// pending-delete guard, day close) and the console handler against a memory
// store. Exit code 1 on the first failed check.
import assert from 'node:assert/strict';

delete process.env.NETLIFY; delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.NETLIFY_BLOBS_CONTEXT;
process.env.ANALYTICS_TZ = 'America/Chicago';

const core = await import('../netlify/lib/analytics-core.mjs');
const { createHandler } = await import('../netlify/lib/analytics-hit.mjs');
const { memoryBlobs } = await import('../netlify/lib/analytics-memstore.mjs');
const { wrapBlobs } = await import('../netlify/lib/analytics-store.mjs');
const { rollup, range, toCsv, handleAnalytics, analyticsSummary, trimMap, LAST_ROLLUP_KEY } = await import('../netlify/lib/analytics-report.mjs');

let n = 0;
const check = async (name, fn) => { n += 1; try { await fn(); console.log(`  ok  ${name}`); } catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };

const TZ = 'America/Chicago';
const T0 = Date.UTC(2026, 8, 16, 15, 0, 0); // 2026-09-16 10:00 Chicago
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const SITE = 'https://kirchner.ink';

// ---- 1. the beacon handler
const blobs = memoryBlobs();
let clock = T0;
const logs = [];
const hit = createHandler({ getStore: () => blobs, env: { get: k => (k === 'ANALYTICS_TZ' ? TZ : undefined) }, now: () => clock, log: t => logs.push(t) });
const req = (body, { method = 'POST', headers = {}, url = `${SITE}/api/hit` } = {}) =>
  new Request(url, { method, headers: { 'user-agent': UA, origin: SITE, 'content-type': 'text/plain', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const ctx = (ip = '203.0.113.9', country = 'US', deploy = 'production') => ({ ip, geo: { country: { code: country } }, deploy: { context: deploy } });
const rawKeys = () => blobs._keys().filter(k => k.startsWith('raw/'));

const r1 = await hit(req({ p: '/work/the-subjects-unanswered-plea/review?x=1#cite=vr2/1', r: 'https://www.google.com/search?q=immunity', w: 1440 }), ctx());
await check('hit: a page view answers 204 with no body and no-store', () => { assert.equal(r1.status, 204); assert.equal(r1.headers.get('cache-control'), 'no-store'); assert.equal(r1.headers.get('set-cookie'), null); });
await check('hit: one raw record and one salt were written', () => { assert.equal(rawKeys().length, 1); assert.equal(blobs._keys().filter(k => k.startsWith('salt/')).length, 1); });
let rec1;
await check('hit: the record holds the normalized path, referrer host, country, device, hour and a 16-hex hash — no IP, no UA', async () => {
  rec1 = await blobs.get(rawKeys()[0], { type: 'json' });
  assert.deepEqual({ d: rec1.d, h: rec1.h, p: rec1.p, r: rec1.r, c: rec1.c, v: rec1.v }, { d: '2026-09-16', h: 10, p: '/work/the-subjects-unanswered-plea/review', r: 'google.com', c: 'US', v: 'desktop' });
  assert.match(rec1.u, /^[0-9a-f]{16}$/); assert.equal(rec1.t, new Date(T0).toISOString());
  const s = JSON.stringify(rec1); assert.doesNotMatch(s, /203\.0\.113\.9/); assert.doesNotMatch(s, /Safari/);
});
clock += 60_000;
await hit(req({ p: '/bio', r: '', w: 390 }), ctx());
await check('hit: the same visitor the same day gets the same hash (phone, direct)', async () => { const r = await blobs.get(rawKeys()[1], { type: 'json' }); assert.equal(r.u, rec1.u); assert.equal(r.v, 'phone'); assert.equal(r.r, ''); });
await hit(req({ p: '/bio', w: 1024 }), ctx('198.51.100.7', 'DE'));
await check('hit: another visitor gets another hash', async () => { const r = await blobs.get(rawKeys()[2], { type: 'json' }); assert.notEqual(r.u, rec1.u); assert.equal(r.c, 'DE'); });
await check('hit: a same-site referrer is dropped to direct', async () => { await hit(req({ p: '/contact', r: `${SITE}/bio`, w: 1200 }), ctx()); const r = await blobs.get(rawKeys().at(-1), { type: 'json' }); assert.equal(r.r, ''); });
const before = rawKeys().length;
const dropped = async (name, request, context = ctx()) => check(`hit: dropped — ${name}`, async () => { const r = await hit(request, context); assert.ok([204, 405].includes(r.status)); assert.equal(rawKeys().length, before); });
await dropped('Sec-GPC: 1', req({ p: '/', w: 1200 }, { headers: { 'sec-gpc': '1' } }));
await dropped('prefetch', req({ p: '/', w: 1200 }, { headers: { 'sec-purpose': 'prefetch' } }));
await dropped('bot user agent', req({ p: '/', w: 1200 }, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }));
await dropped('empty user agent', req({ p: '/', w: 1200 }, { headers: { 'user-agent': '' } }));
await dropped('foreign origin', req({ p: '/', w: 1200 }, { headers: { origin: 'https://evil.example' } }));
await dropped('no origin and no referer', new Request(`${SITE}/api/hit`, { method: 'POST', headers: { 'user-agent': UA }, body: '{"p":"/"}' }));
await dropped('GET', req(null, { method: 'GET' }));
await dropped('bad JSON', req('nope'));
await dropped('private path /admin/readings', req({ p: '/admin/readings', w: 1200 }));
await dropped('path without a leading slash', req({ p: 'bio', w: 1200 }));
await check('hit: a Referer stands in for a missing Origin', async () => { await hit(new Request(`${SITE}/api/hit`, { method: 'POST', headers: { 'user-agent': UA, referer: `${SITE}/bio` }, body: '{"p":"/terms","w":900}' }), ctx()); assert.equal(rawKeys().length, before + 1); });
await check('hit: a branch deploy writes into its own store name', async () => {
  const names = []; const h2 = createHandler({ getStore: name => { names.push(name); return memoryBlobs(); }, now: () => clock });
  await h2(req({ p: '/', w: 1200 }), ctx('1.1.1.1', 'US', 'branch-deploy')); await h2(req({ p: '/', w: 1200 }), ctx('1.1.1.1', 'US', 'production'));
  assert.deepEqual(names, ['analytics-branch-deploy', 'analytics']);
});
await check('hit: the salt is created once (onlyIfNew) and read back by a second isolate', async () => {
  const shared = memoryBlobs(); const a = createHandler({ getStore: () => shared, now: () => clock }); const b = createHandler({ getStore: () => shared, now: () => clock });
  await a(req({ p: '/', w: 1200 }), ctx()); await b(req({ p: '/', w: 1200 }), ctx());
  const recs = await Promise.all(shared._keys().filter(k => k.startsWith('raw/')).map(k => shared.get(k, { type: 'json' })));
  assert.equal(recs.length, 2); assert.equal(recs[0].u, recs[1].u); assert.equal(shared._keys().filter(k => k.startsWith('salt/')).length, 1);
});
await check('hit: a store failure is logged and still answers 204', async () => {
  const broken = createHandler({ getStore: () => ({ set: async () => { throw new Error('blobs down'); }, get: async () => null, setJSON: async () => { throw new Error('blobs down'); } }), now: () => clock, log: t => logs.push(t) });
  const r = await broken(req({ p: '/', w: 1200 }), ctx()); assert.equal(r.status, 204); assert.ok(logs.some(t => /blobs down/.test(t)));
});
await check('hit: nothing about a visitor reaches the log', () => { const s = logs.join('\n'); assert.doesNotMatch(s, /203\.0\.113/); assert.doesNotMatch(s, /Safari/); });

// ---- 2. the roll-up
const store = wrapBlobs(blobs, 'memory');
const rawCount = rawKeys().length;
const s1 = await rollup(store, T0 + 3_600_000, { tz: TZ });
await check('rollup: folds every raw view into its day and deletes the raws', async () => {
  assert.equal(s1.locked, false); assert.deepEqual(s1.days, ['2026-09-16']); assert.equal(s1.folded, rawCount); assert.equal(rawKeys().length, 0);
  const d = await store.get('day/2026-09-16.json');
  assert.equal(d.views, rawCount); assert.equal(d.uniques, 2); assert.equal(d.visitors.length, 2); assert.equal(d.closed, false);
  assert.equal(d.paths['/bio'], 2); assert.equal(d.refs['google.com'], 1); assert.equal(d.refs['(direct)'], rawCount - 1); assert.equal(d.countries.US, rawCount - 1); assert.equal(d.countries.DE, 1);
  assert.equal(d.devices.phone, 1); assert.equal(d.hours[10], rawCount); assert.equal(d.pending_delete.length, rawCount);
});
await check('rollup: a second run is a no-op (idempotent) and the lock is released', async () => {
  const s2 = await rollup(store, T0 + 3_700_000, { tz: TZ }); assert.equal(s2.folded, 0); assert.equal(s2.locked, false);
  assert.equal((await store.get('day/2026-09-16.json')).views, rawCount); assert.equal(await store.get(core.LOCK_KEY), null);
});
await check('rollup: the last summary is kept for the console', async () => { const l = await store.get(LAST_ROLLUP_KEY); assert.ok(l.at); assert.equal(l.locked, false); });
await check('rollup: a raw key named in pending_delete is removed without being counted again', async () => {
  const d = await store.get('day/2026-09-16.json'); const ghost = d.pending_delete[0];
  await blobs.setJSON(ghost, rec1); // the delete "failed" last time: the record is back
  const s = await rollup(store, T0 + 3_800_000, { tz: TZ });
  assert.equal(s.folded, 0); assert.equal(s.skipped, 1); assert.equal(rawKeys().length, 0); assert.equal((await store.get('day/2026-09-16.json')).views, rawCount);
});
await check('rollup: a held lock makes the run leave without touching anything', async () => {
  await store.set(core.LOCK_KEY, { at: T0 + 3_900_000 }); clock = T0 + 3_900_000;
  await hit(req({ p: '/legal', w: 1200 }), ctx());
  const s = await rollup(store, T0 + 3_900_000, { tz: TZ }); assert.equal(s.locked, true); assert.equal(rawKeys().length, 1);
  await store.del(core.LOCK_KEY);
});
await check('rollup: a stale lock (older than two minutes) is taken over', async () => {
  await store.set(core.LOCK_KEY, { at: T0 }); const s = await rollup(store, T0 + 4_000_000, { tz: TZ }); assert.equal(s.locked, false); assert.equal(s.folded, 1); assert.equal(rawKeys().length, 0);
});
await check('rollup: the day closes an hour into the next day — visitors gone, count kept, salt deleted', async () => {
  const notYet = await rollup(store, Date.UTC(2026, 8, 17, 5, 30), { tz: TZ }); // 00:30 Chicago on the 17th
  assert.deepEqual(notYet.closed, []); assert.ok(await blobs.get('salt/2026-09-16'));
  const s = await rollup(store, Date.UTC(2026, 8, 17, 6, 5), { tz: TZ }); // 01:05
  assert.deepEqual(s.closed, ['2026-09-16']);
  const d = await store.get('day/2026-09-16.json'); assert.equal(d.closed, true); assert.equal(d.uniques, 2); assert.deepEqual(d.visitors, []); assert.equal(d.views, rawCount + 1);
  assert.equal(await blobs.get('salt/2026-09-16'), null); assert.doesNotMatch(JSON.stringify(d), new RegExp(rec1.u));
});
await check('rollup: a view landing on a closed day counts as a view, not a visitor', async () => {
  clock = T0; await hit(req({ p: '/late', w: 1200 }), ctx());
  await rollup(store, Date.UTC(2026, 8, 17, 7, 0), { tz: TZ });
  const d = await store.get('day/2026-09-16.json'); assert.equal(d.views, rawCount + 2); assert.equal(d.uniques, 2); assert.equal(d.paths['/late'], 1);
});
await check('trimMap: keeps the TOP_N and folds the rest into (other)', () => {
  const m = {}; for (let i = 0; i < 600; i++) m[`/p${i}`] = i + 1;
  const t = trimMap(m, 500); assert.equal(Object.keys(t).length, 501); assert.equal(t['/p599'], 600); assert.equal(t['(other)'], Array.from({ length: 100 }, (_, i) => i + 1).reduce((a, b) => a + b, 0));
});

// ---- 3. the report
clock = Date.UTC(2026, 8, 17, 16, 0); // the 17th, 11:00 Chicago
await hit(req({ p: '/bio', w: 1200 }), ctx()); await hit(req({ p: '/', w: 500 }), ctx('9.9.9.9', 'GB'));
await rollup(store, clock + 1000, { tz: TZ });
const rep = await range(store, 7, clock + 2000, TZ);
await check('range: seven days ending today, series in order, totals merged across days', () => {
  assert.equal(rep.series.length, 7); assert.equal(rep.to, '2026-09-17'); assert.equal(rep.from, '2026-09-11');
  const d16 = rep.series.find(s => s.day === '2026-09-16'), d17 = rep.series.find(s => s.day === '2026-09-17');
  assert.equal(d16.views, rawCount + 2); assert.equal(d16.closed, true); assert.equal(d17.views, 2); assert.equal(d17.uniques, 2); assert.equal(d17.closed, false);
  assert.equal(rep.totals.views, rawCount + 4); assert.equal(rep.totals.uniques, 4); assert.equal(rep.totals.paths['/bio'], 3); assert.equal(rep.totals.countries.GB, 1); assert.equal(rep.totals.hours[10] + rep.totals.hours[11], rawCount + 4);
});
await check('csv: one line per day, header first', () => { const lines = toCsv(rep).trim().split('\n'); assert.equal(lines[0], 'day,views,visitors,closed'); assert.equal(lines.length, 8); assert.equal(lines.at(-1), `2026-09-17,2,2,no`); });

// ---- 4. the console handler
const cfg = { clientSecret: 'test-secret-test-secret' };
const { csrfToken } = await import('../netlify/lib/admin-auth.mjs');
const sess = { email: 'owner@example.com', name: 'Owner', iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
const csrf = csrfToken(cfg, sess);
const cx = { sess, csrf, csrfOk: g => g === csrf };
const get = p => handleAnalytics(new Request(`${SITE}${p}`), new URL(`${SITE}${p}`), cx, { store, now: clock + 3000 });
const pageRes = await get('/admin/analytics?range=7');
await check('console: the page renders totals, the chart, the tables and the roll-up form', async () => {
  const html = await pageRes.text(); assert.equal(pageRes.status, 200);
  assert.match(html, /page views/); assert.match(html, /<svg viewBox/); assert.match(html, /google\.com/); assert.match(html, /\/bio/); assert.match(html, /action="\/admin\/analytics\/rollup"/); assert.match(html, /<b>7 days<\/b>/);
  assert.match(pageRes.headers.get('content-security-policy'), /default-src 'none'/); assert.equal(pageRes.headers.get('cache-control'), 'no-store');
});
await check('console: an unknown range falls back to 30 days', async () => { const html = await (await get('/admin/analytics?range=12')).text(); assert.match(html, /<b>30 days<\/b>/); });
await check('console: CSV and JSON download with no-store and a filename', async () => {
  const c = await get('/admin/analytics.csv?range=7'); assert.match(c.headers.get('content-type'), /text\/csv/); assert.match(c.headers.get('content-disposition'), /analytics-2026-09-11-2026-09-17\.csv/); assert.match(await c.text(), /^day,views,visitors,closed/);
  const j = await get('/admin/analytics.json?range=7'); const body = await j.json(); assert.equal(body.series.length, 7); assert.equal(body.totals.views, rawCount + 4);
});
const post = fields => handleAnalytics(new Request(`${SITE}/admin/analytics/rollup`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }), new URL(`${SITE}/admin/analytics/rollup`), cx, { store, now: clock + 4000 });
await check('console: roll-up refuses a wrong CSRF token', async () => assert.equal((await post({ csrf: 'wrong' })).status, 403));
await check('console: roll-up runs and redirects with a flash', async () => { const r = await post({ csrf }); assert.equal(r.status, 303); assert.match(r.headers.get('location'), /\/admin\/analytics\?m=Rolled/); });
await check('console: unknown analytics path → 404', async () => assert.equal((await get('/admin/analytics/nope')).status, 404));
await check('summary: the home card reads the last seven days and never throws', async () => {
  const s = await analyticsSummary({ store, now: clock + 5000 }); assert.equal(s.views, rawCount + 4); assert.equal(s.uniques, 4);
  const bad = await analyticsSummary({ store: { kind: 'x', get: async () => { throw new Error('down'); } } }); assert.equal(bad.error, 'down');
});

console.log(process.exitCode ? `\n${n} checks — FAILURES above` : `\n${n} checks passed`);
