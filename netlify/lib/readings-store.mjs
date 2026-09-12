// netlify/lib/readings-store.mjs — the private queue behind Open Readings.
//
// One key-value store, three prefixes:
//   pending/<id>     a reader's submission as received (INCLUDES contact — private, like the dashboard)
//   approved/<id>    the published entry in the standard format (NO contact) — folded into
//                    content/readings/<collection>.answers.json by scripts/pull-reading-answers.mjs
//                    at the next build of main
//   decided/<id>     {decision, date, item_id} — what the owner decided and when
//   author-only/<id> the full record of an answer the owner may read but must not publish
//
//   audit/<key>      append-only record of every action (netlify/lib/audit.mjs)
//
// WHERE IT LIVES
//   In a Netlify function: Netlify Blobs, ALWAYS, through the credentials the
//   runtime injects — never a token from the environment (a personal access token
//   is account-wide; docs/ADMIN_CONSOLE_SECURITY_PLAN.md §2.1). If the runtime
//   has not configured Blobs the error is rethrown with a plain message so it
//   shows in the function log; never a silent local fallback (that lost
//   submissions on 2026-09-09).
//   In a Netlify build: Blobs via the injected NETLIFY_BLOBS_CONTEXT; failing that
//   a WARNING and an empty read-only store (nothing publishes that build).
//   Anywhere else (local dev, tests): .cache/readings-store/ as JSON files.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORE_NAME = 'open-readings';

// The local directory is resolved LAZILY and defensively. Netlify bundles a
// legacy handler(event) function to CommonJS, where `import.meta.url` is
// undefined; a module-level fileURLToPath(import.meta.url) threw at load and the
// function never ran (measured in the function log 2026-09-10 06:32: "The path
// argument must be of type string or an instance of URL. Received undefined",
// Phase: init). Nothing on Netlify ever needs this path.
function localDir() {
  if (process.env.READINGS_STORE_DIR) return process.env.READINGS_STORE_DIR;
  const here = typeof import.meta !== 'undefined' && import.meta.url ? dirname(fileURLToPath(import.meta.url)) : process.cwd();
  return join(here, import.meta.url ? '../../.cache/readings-store' : '.cache/readings-store');
}

// Where are we? A Netlify FUNCTION (Lambda) must use Blobs — the runtime
// configures it; if that fails the error must surface in the function log, not
// vanish into a read-only local directory. A Netlify BUILD uses Blobs when the
// runtime context or SITE_ID + NETLIFY_AUTH_TOKEN is present, and otherwise
// warns and reads an empty local store so the build still succeeds.
const inFunction = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext);
const inBuild = () => process.env.NETLIFY === 'true' && !inFunction();

function contextHasUncachedEdge() {
  try {
    const raw = process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext;
    return raw ? Boolean(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).uncachedEdgeURL) : false;
  } catch { return false; }
}

async function blobStore() {
  const { getStore } = await import('@netlify/blobs');
  // Strong consistency where the runtime supports it: a moderation queue must list
  // a record the moment the event function wrote it, and the default (eventual)
  // may lag reads by up to a minute. Strong reads need the context's
  // uncachedEdgeURL, which the modern (Request) runtime supplies and the legacy
  // handler(event) context from connectLambda does NOT — asking for it there
  // fails every read (measured 2026-09-10). So: strong when available, else default.
  return getStore(contextHasUncachedEdge() ? { name: STORE_NAME, consistency: 'strong' } : STORE_NAME); // the runtime's own credentials; throws a descriptive error when they are absent
}

const wrapBlobs = s => ({
  kind: 'blobs',
  async get(key) { return (await s.get(key, { type: 'json' })) ?? null; },
  async set(key, obj) { await s.setJSON(key, obj); },
  async del(key) { await s.delete(key); },
  async list(prefix) { const { blobs } = await s.list({ prefix }); return blobs.map(b => b.key); },
});

function localStore(dir = localDir(), readonly = false) {
  const file = key => join(dir, key.replace(/\//g, '__') + '.json');
  return {
    kind: readonly ? 'local-empty' : `local:${dir}`,
    async get(key) { return !readonly && existsSync(file(key)) ? JSON.parse(readFileSync(file(key), 'utf8')) : null; },
    async set(key, obj) { if (readonly) throw new Error('the store is read-only here'); mkdirSync(dir, { recursive: true }); writeFileSync(file(key), JSON.stringify(obj, null, 2) + '\n'); },
    async del(key) { if (!readonly) rmSync(file(key), { force: true }); },
    async list(prefix) {
      if (readonly || !existsSync(dir)) return [];
      const p = prefix.replace(/\//g, '__');
      return readdirSync(dir).filter(f => f.startsWith(p) && f.endsWith('.json')).map(f => f.slice(0, -5).replace(/__/g, '/')).sort();
    },
  };
}

/** returns { kind, get(key), set(key, obj), del(key), list(prefix) → keys[] } */
export async function openStore() {
  if (inFunction()) return wrapBlobs(await blobStore()); // throws with a plain message if unconfigured
  if (inBuild()) {
    try { return wrapBlobs(await blobStore()); }
    catch (e) {
      console.warn(`readings-store: WARNING — Netlify build without Blobs access (${e.message}). Approved answers are NOT available to this build.`);
      return localStore(localDir(), true);
    }
  }
  return localStore(localDir());
}
