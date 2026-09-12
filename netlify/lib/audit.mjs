// netlify/lib/audit.mjs — the console's append-only audit trail.
//
// Every state change in the private store writes ONE record under
//   audit/<timestamp>-<submission id>
// and nothing in this codebase deletes or overwrites under that prefix. The
// record answers "who did what, to which submission, when, from where":
//   at             ISO time
//   actor          the session e-mail ('netlify-forms' for arrivals, 'build' for exports)
//   action         received | published | withdrawn | rejected | author_only | imported
//   id             submission id;  item_id / collection  what it answers
//   from → to      store prefixes the record moved between
//   ip, ua         request origin (STORE ONLY — stripped by publicAudit() before any export)
//   content_sha256 hash of the record as it stood at the moment of the action
//
// The console home shows the newest lines so the owner sees any action they did
// not take; scripts/pull-reading-answers.mjs exports the trail (without ip/ua)
// at build so the history outlives the store.
import { createHash } from 'node:crypto';

export const AUDIT_PREFIX = 'audit/';

const stamp = d => d.toISOString().replace(/[:.]/g, '-');

export async function writeAudit(store, { actor, action, id, item_id = '', collection = '', from = '', to = '', req = null, content = null }) {
  const now = new Date();
  const rec = {
    at: now.toISOString(), actor: String(actor || 'unknown'), action: String(action), id: String(id),
    item_id: String(item_id || ''), collection: String(collection || ''), from, to,
    ip: req?.headers?.get?.('x-nf-client-connection-ip') || '',
    ua: (req?.headers?.get?.('user-agent') || '').slice(0, 200),
    content_sha256: content ? createHash('sha256').update(JSON.stringify(content)).digest('hex') : '',
  };
  await store.set(`${AUDIT_PREFIX}${stamp(now)}-${rec.id}`, rec);
  return rec;
}

/** newest first */
export async function recentAudit(store, n = 20) {
  const keys = (await store.list(AUDIT_PREFIX)).sort().reverse().slice(0, n);
  return (await Promise.all(keys.map(k => store.get(k)))).filter(Boolean);
}

/** a stable, non-reversible stand-in for an actor's e-mail (12 hex chars) */
export const actorHash = actor => createHash('sha256').update(`actor:${actor}`).digest('hex').slice(0, 12);

/** the record as it may leave the store: no request origin, no e-mail —
 *  the actor becomes a hash, still distinguishable, never publishable */
export function publicAudit(rec) {
  const rest = { ...rec }; delete rest.ip; delete rest.ua;
  if (rest.actor && rest.actor.includes('@')) rest.actor = `hash:${actorHash(rest.actor)}`;
  return rest;
}
