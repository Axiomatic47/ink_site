// netlify/functions/submission-created.mjs — Netlify invokes a function with
// exactly this name for every VERIFIED (non-spam) form submission on the site;
// the body is {payload: {id, created_at, form_name, data}}. Written in the
// legacy handler(event) form (harmless; the docs say the modern Request form is
// also supported under the filename convention, so the signature was NOT the
// 2026-09-09 cause — a silent local-store fallback inside the function was).
// Open-reading answers are queued as pending records in the private store; the
// owner decides on them at /admin/readings. Other forms are ignored. Store errors
// are logged and returned as 500 so they show in the function log instead of
// vanishing. The console also syncs straight from Netlify Forms on every load
// when NETLIFY_AUTH_TOKEN + SITE_ID are set, so the queue does not depend on
// this function alone.
import { connectLambda } from '@netlify/blobs';
import { openStore } from '../lib/readings-store.mjs';
import { FORM_NAME, toPending } from '../lib/readings-format.mjs';
import { writeAudit } from '../lib/audit.mjs';

// A legacy handler(event) function is NOT handed a configured Blobs client. The
// credentials ride on the event itself (event.blobs, base64 {url, token}, plus the
// x-nf-site-id / x-nf-deploy-id headers) and @netlify/blobs reads them only when
// connectLambda(event) is called first. Without it getStore() throws "The
// environment has not been configured to use Netlify Blobs" — the reason
// submissions reached the Forms dashboard and never the queue on both sites
// (2026-09-09/10). The console's admin function never had this problem because
// the modern (Request) form configures Blobs on its own.
function connectBlobs(event) {
  if (event?.blobs) { connectLambda(event); return 'event.blobs'; }
  if (process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext) return 'context';
  return 'none';
}

export const handler = async (event) => {
  let body;
  try { body = JSON.parse(event?.body || '{}'); } catch { return { statusCode: 400, body: 'bad payload' }; }
  const s = body?.payload ?? (body?.form_name ? body : null);
  if (!s || s.form_name !== FORM_NAME) return { statusCode: 200, body: 'ignored' };
  try {
    const via = connectBlobs(event);
    if (via === 'none' && process.env.NETLIFY === 'true') console.warn(`submission-created: no Blobs credentials on this invocation (event keys: ${Object.keys(event || {}).join(',')}; header keys: ${Object.keys(event?.headers || {}).join(',')})`);
    const store = await openStore();
    const rec = toPending(s);
    if (await store.get(`pending/${rec.id}`) || await store.get(`decided/${rec.id}`)) return { statusCode: 200, body: 'seen' };
    await store.set(`pending/${rec.id}`, rec);
    await writeAudit(store, { actor: 'netlify-forms', action: 'received', id: rec.id, item_id: rec.item_id, collection: rec.collection, from: 'netlify-forms', to: 'pending', content: rec });
    console.log(`submission-created: queued ${rec.id} → ${rec.collection}/${rec.item_id} (store=${store.kind}, blobs via ${via})`);
    return { statusCode: 200, body: 'queued' };
  } catch (e) {
    console.error(`submission-created: FAILED to queue ${s.id}: ${e.message}`);
    return { statusCode: 500, body: `store error: ${e.message}` };
  }
};
