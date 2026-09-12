#!/usr/bin/env node
// scripts/pull-reading-answers.mjs — build step: fold every APPROVED answer
// from the private store into content/readings/<collection>.answers.json so the
// prerendered item and acknowledgements pages carry it. Runs first in
// `npm run build:next`; the readings validator runs right after it.
//
// Off Netlify it reads the local store (.cache/readings-store/) and only prints
// what it would write unless --write is given — so a local run never leaves
// build-time answers in the working tree by accident. On Netlify it writes.
//
// Entries carry the submission id, so an answer already committed by hand (or
// by an earlier build that someone copied into the repo) is never duplicated.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../netlify/lib/readings-store.mjs';
import { publicAudit, actorHash } from '../netlify/lib/audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'content', 'readings');
const WRITE = process.env.NETLIFY === 'true' || process.argv.includes('--write');

const store = await openStore();
const keys = await store.list('approved/');
const approved = (await Promise.all(keys.map(k => store.get(k)))).filter(Boolean);
console.log(`pull-reading-answers: store=${store.kind} approved=${approved.length}${WRITE ? '' : ' (dry run — pass --write)'}`);
if (process.env.NETLIFY === 'true' && store.kind !== 'blobs') console.warn('pull-reading-answers: WARNING — this Netlify build has no Blobs context, so approved answers are NOT being published by it. Blobs is injected by Netlify\'s build system; do not paper over this with an account token (docs/ADMIN_CONSOLE_SECURITY_PLAN.md §2.1).');

const byCollection = new Map();
for (const a of approved) {
  if (!a.collection || !a.item_id) { console.warn(`  skipping approved/${a.id}: no collection/item_id`); continue; }
  if (!byCollection.has(a.collection)) byCollection.set(a.collection, []);
  byCollection.get(a.collection).push(a);
}

let added = 0;
for (const [collection, list] of byCollection) {
  if (!existsSync(join(DIR, `${collection}.json`))) { console.warn(`  ${collection}: no items file — ${list.length} approved answer(s) left in the store`); continue; }
  const file = join(DIR, `${collection}.answers.json`);
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { answers: [] };
  const answers = Array.isArray(data) ? data : data.answers;
  const have = new Set(answers.map(a => a.id).filter(Boolean));
  for (const a of list.sort((x, y) => (x.published + x.id).localeCompare(y.published + y.id))) {
    if (have.has(a.id)) continue;
    const entry = { ...a }; delete entry.collection; // the entry itself carries no collection field
    answers.push(entry);
    added += 1;
    console.log(`  + ${collection}/${a.item_id} ${a.letter} by ${a.reader.display} (${a.published})`);
  }
  if (WRITE) writeFileSync(file, JSON.stringify(Array.isArray(data) ? answers : data, null, 2) + '\n');
}
console.log(`pull-reading-answers: ${added} answer(s) ${WRITE ? 'written' : 'would be written'}.`);

// ---- store export (docs/ADMIN_CONSOLE_SECURITY_PLAN.md §2.4, §2.8): everything the
// history needs to survive the store, minus what must stay private. Contact,
// name-as-written and credentials never leave the store; audit and decided
// records lose their request origin and carry the actor as a hash, not an
// e-mail (the repository may be public). `pending/` is not exported (it is the private inbox).
// On Netlify this lands in the build's working copy only — to VERSION the
// history, run `npm run readings:pull -- --write` locally now and then and
// commit content/readings/_store-export.json.
const strip = r => { const rest = { ...r }; delete rest.name; delete rest.contact; delete rest.credentials; return rest; };
const load = async prefix => (await Promise.all((await store.list(prefix)).map(k => store.get(k)))).filter(Boolean);
const exportFile = join(DIR, '_store-export.json');
const previous = existsSync(exportFile) ? JSON.parse(readFileSync(exportFile, 'utf8')) : {};
const exported = {
  exported_at: new Date().toISOString(),
  store: store.kind,
  decided: {},
  approved: approved.map(a => ({ ...a })),
  author_only: (await load('author-only/')).map(strip),
  audit: (await load('audit/')).map(publicAudit).sort((a, b) => a.at.localeCompare(b.at)),
};
for (const k of await store.list('decided/')) { const d = await store.get(k); if (d?.actor?.includes('@')) d.actor = `hash:${actorHash(d.actor)}`; exported.decided[k.slice('decided/'.length)] = d; }
if (store.kind === 'local-empty' && previous.audit) { console.log('pull-reading-answers: store unavailable — keeping the previous export.'); }
else {
  console.log(`pull-reading-answers: export — ${Object.keys(exported.decided).length} decided, ${exported.author_only.length} author-only, ${exported.audit.length} audit record(s)${WRITE ? ' written' : ' (dry run)'}.`);
  if (WRITE) writeFileSync(exportFile, JSON.stringify(exported, null, 2) + '\n');
}
