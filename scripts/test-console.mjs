#!/usr/bin/env node
// scripts/test-console.mjs — the console's proof, runnable anywhere:
//   node scripts/test-console.mjs        (npm run test:console)
// Exercises the event function, the moderation decisions with their audit
// trail, the response headers, the cookie attributes and the passphrase gate
// against a throw-away local store. Exit code 1 on the first failed check.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'ink-console-'));
process.env.READINGS_STORE_DIR = dir;
delete process.env.NETLIFY; delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.NETLIFY_BLOBS_CONTEXT;
delete process.env.NETLIFY_AUTH_TOKEN; delete process.env.SITE_ID;

const { handler: onSubmission } = await import('../netlify/functions/submission-created.mjs');
const { default: admin } = await import('../netlify/functions/admin.mjs');
const { openStore } = await import('../netlify/lib/readings-store.mjs');
const { handleReadings } = await import('../netlify/lib/readings-moderation.mjs');
const { page } = await import('../netlify/lib/admin-ui.mjs');
const { authConfig, beginLogin, sessionCookie, csrfToken } = await import('../netlify/lib/admin-auth.mjs');
const { publicAudit, recentAudit } = await import('../netlify/lib/audit.mjs');

let n = 0;
const check = async (name, fn) => { n += 1; try { await fn(); console.log(`  ok  ${name}`); } catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; } };
const quiet = async fn => { const log = console.log, err = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = log; console.error = err; } };

// ---- 1. event function
const payload = { id: 'sub-1', created_at: '2026-09-09T20:00:00Z', form_name: 'open-reading', data: { collection: 'damascus-document-genizah', item_id: 'cd-a-01', letter: 'a', reading: 'אבג', name: 'Test Reader', contact: 'reader@example.com', publish_choice: 'publish', ack_consent: 'on' } };
const r1 = await quiet(() => onSubmission({ body: JSON.stringify({ payload }) }));
await check('event: first submission is queued', () => assert.equal(r1.body, 'queued'));
await check('event: same id again is seen', async () => assert.equal((await onSubmission({ body: JSON.stringify({ payload }) })).body, 'seen'));
await check('event: bare {form_name,data} body accepted', async () => assert.equal((await onSubmission({ body: JSON.stringify(payload) })).body, 'seen'));
await check('event: bad JSON → 400', async () => assert.equal((await onSubmission({ body: 'nope' })).statusCode, 400));
await check('event: other form ignored', async () => assert.equal((await onSubmission({ body: JSON.stringify({ payload: { ...payload, form_name: 'contact' } }) })).body, 'ignored'));
process.env.AWS_LAMBDA_FUNCTION_NAME = 'submission-created';
const r500 = await quiet(() => onSubmission({ body: JSON.stringify({ payload: { ...payload, id: 'sub-2' } }) }));
await check('event: in a function with no Blobs → 500 naming Blobs, never a local write', () => { assert.equal(r500.statusCode, 500); assert.match(r500.body, /Netlify Blobs/); });
// legacy invocation carries the credentials on the event; connectLambda must load them
const lambdaEvent = { body: JSON.stringify({ payload: { ...payload, id: 'sub-3' } }), blobs: Buffer.from(JSON.stringify({ url: 'https://blobs.example.invalid', token: 't' })).toString('base64'), headers: { 'x-nf-site-id': 'site-1', 'x-nf-deploy-id': 'dep-1' } };
const rLambda = await quiet(() => onSubmission(lambdaEvent));
delete process.env.AWS_LAMBDA_FUNCTION_NAME;
await check('event: legacy event.blobs is loaded via connectLambda (store opens as blobs; only the network is absent here)', () => { assert.equal(rLambda.statusCode, 500); assert.doesNotMatch(rLambda.body, /has not been configured/); assert.doesNotMatch(rLambda.body, /strong consistency/); assert.ok(process.env.NETLIFY_BLOBS_CONTEXT, 'connectLambda set NETLIFY_BLOBS_CONTEXT'); });
delete process.env.NETLIFY_BLOBS_CONTEXT;

// ---- 2. store + audit after arrival
const store = await openStore();
await check('store: local store in tests', () => assert.match(store.kind, /^local:/));
await check('audit: arrival recorded by netlify-forms', async () => { const a = await recentAudit(store, 5); assert.equal(a[0].action, 'received'); assert.equal(a[0].actor, 'netlify-forms'); assert.ok(a[0].content_sha256.length === 64); });

// ---- 3. moderation decision through the console handler
const cfg = { clientSecret: 'test-secret-test-secret' };
const sess = { email: 'owner@example.com', name: 'Owner', iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
const csrf = csrfToken(cfg, sess);
const ctx = { sess, csrf, csrfOk: g => g === csrf };
const post = (fields, extra = {}) => new Request('https://kirchner.ink/admin/readings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-nf-client-connection-ip': '203.0.113.9', 'user-agent': 'test', ...extra }, body: new URLSearchParams(fields).toString() });
const bad = await handleReadings(post({ csrf: 'wrong', id: 'sub-1', decision: 'publish' }), new URL('https://kirchner.ink/admin/readings'), ctx);
await check('console: wrong CSRF token → 403', () => assert.equal(bad.status, 403));
const pub = await handleReadings(post({ csrf, id: 'sub-1', decision: 'publish' }), new URL('https://kirchner.ink/admin/readings'), ctx);
await check('console: publish → 303 back to the queue', () => assert.equal(pub.status, 303));
await check('console: approved record exists, pending gone', async () => { assert.ok(await store.get('approved/sub-1')); assert.equal(await store.get('pending/sub-1'), null); });
await check('console: decided record names actor and time', async () => { const d = await store.get('decided/sub-1'); assert.equal(d.decision, 'published'); assert.equal(d.actor, 'owner@example.com'); assert.match(d.at, /^\d{4}-/); });
await check('audit: publish recorded with actor, ip, ua, hash', async () => { const a = (await recentAudit(store, 5)).find(x => x.action === 'published'); assert.equal(a.actor, 'owner@example.com'); assert.equal(a.ip, '203.0.113.9'); assert.equal(a.from, 'pending'); assert.equal(a.to, 'approved'); assert.equal(a.content_sha256.length, 64); });
await check('audit: public form drops ip, ua and the actor e-mail', async () => { const a = publicAudit((await recentAudit(store, 1))[0]); assert.equal(a.ip, undefined); assert.equal(a.ua, undefined); assert.ok(a.at); assert.match(a.actor, /^hash:[0-9a-f]{12}$/); assert.doesNotMatch(JSON.stringify(a), /@/); });
await check('audit: two records, none overwritten', async () => assert.equal((await store.list('audit/')).length, 2));
const list = await handleReadings(new Request('https://kirchner.ink/admin/readings'), new URL('https://kirchner.ink/admin/readings'), ctx);
await check('console: queue page renders with store line', async () => { const html = await list.text(); assert.match(html, /Queue store:/); assert.match(html, /Netlify Forms sync: off/); });

// ---- 4. headers and cookies
const res = page({ title: 't', body: '<p>x</p>' });
await check('headers: CSP denies everything but inline style', () => assert.match(res.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'none'/));
await check('headers: X-Frame-Options DENY, no-referrer, nosniff, no-store', () => { assert.equal(res.headers.get('x-frame-options'), 'DENY'); assert.equal(res.headers.get('referrer-policy'), 'no-referrer'); assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); assert.equal(res.headers.get('cache-control'), 'no-store'); });
await check('cookies: session is SameSite=Strict, HttpOnly, Secure', () => assert.match(sessionCookie(cfg, sess), /HttpOnly; Secure; SameSite=Strict/));
await check('cookies: sign-in flow cookie is SameSite=Lax', () => assert.match(beginLogin({ ...cfg, domain: 'x.auth0.com', clientId: 'c' }, 'https://kirchner.ink/admin/callback').cookie, /SameSite=Lax/));

// ---- 5. passphrase gate
process.env.MODERATION_KEY = 'a-long-emergency-passphrase-0123456789';
for (const k of ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'ADMIN_EMAILS']) delete process.env[k];
const signIn = await admin(new Request('https://kirchner.ink/admin'));
await check('passphrase: offered while Auth0 is NOT configured', async () => assert.match(await signIn.text(), /Emergency passphrase/));
const pp = await admin(new Request('https://kirchner.ink/admin/passphrase', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'passphrase=' + process.env.MODERATION_KEY }));
await check('passphrase: correct key signs in (303) with a Strict cookie', () => { assert.equal(pp.status, 303); assert.match(pp.headers.get('set-cookie'), /SameSite=Strict/); });
Object.assign(process.env, { AUTH0_DOMAIN: 'x.auth0.com', AUTH0_CLIENT_ID: 'c', AUTH0_CLIENT_SECRET: 's-s-s-s-s-s-s-s', ADMIN_EMAILS: 'owner@example.com' });
const signIn2 = await admin(new Request('https://kirchner.ink/admin'));
await check('passphrase: form gone and deletion asked once Auth0 is configured', async () => { const html = await signIn2.text(); assert.doesNotMatch(html, /action="\/admin\/passphrase"/); assert.match(html, /delete the variable/); });
const pp2 = await admin(new Request('https://kirchner.ink/admin/passphrase', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'passphrase=' + process.env.MODERATION_KEY }));
await check('passphrase: POST answers 404 once Auth0 is configured', () => assert.equal(pp2.status, 404));
await check('auth: config complete', () => assert.equal(authConfig().missing.length, 0));

// ---- 6. the deployed shape: Netlify bundles a legacy handler(event) function to
// CommonJS, where import.meta.url is undefined. A module-level path computed from
// it crashed the function at init (function log 2026-09-10 06:32). Bundle exactly
// that way and require the result.
{
  const { execFileSync } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const out = join(dir, 'submission-created.cjs');
  execFileSync(join(process.cwd(), 'node_modules', '.bin', 'esbuild'), ['netlify/functions/submission-created.mjs', '--bundle', '--platform=node', '--format=cjs', `--outfile=${out}`, '--log-level=error']);
  const cjsStore = join(dir, 'cjs-store'); process.env.READINGS_STORE_DIR = cjsStore;
  let mod, loadErr = null;
  try { mod = createRequire(import.meta.url)(out); } catch (e) { loadErr = e; }
  await check('bundle: the CommonJS bundle of submission-created loads (no import.meta.url at module level)', () => assert.equal(loadErr, null, loadErr?.message));
  const r = mod ? await quiet(() => mod.handler({ body: JSON.stringify({ payload: { ...payload, id: 'cjs-1' } }) })) : null;
  await check('bundle: the CommonJS bundle queues a submission', () => assert.equal(r?.body, 'queued'));
  process.env.READINGS_STORE_DIR = dir;
}

rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? `\n${n} checks — FAILURES above` : `\n${n} checks passed`);
