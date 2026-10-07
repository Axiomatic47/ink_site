// scripts/validate-timeline.mjs — build gate for public/research/immunity-timeline.json (the /research/immunity-timeline
// page; shape in src/lib/immunity-timeline.ts). Absent file → pass (the route answers 404). Present → exit 1 on:
//   - a missing header field (title, standfirst, provenance.book_title/book_slug/date) or an entries array that is empty;
//   - an entry without id/year/date_text/title/category/summary/source.cite; an id that is not a slug or not unique;
//     a year that is not an integer (year_end likewise, and not before year); a category outside the closed set;
//   - a kind outside decision · statute · constitutional-text · report · treatise · event (when given);
//   - a quote without its pin; a link that is not http(s);
//   - a source.book_unit that is not <note>/<seq> or does not begin with the entry's book_note (the review page's #cite id);
//   - a comparison step (an older file may still carry the block; the page no longer draws it) without
//     step/label/their_title/their_claim/correction, or an entry_id that resolves to nothing;
//   - COORDINATION VOCABULARY in any text a reader sees (seat ids, "drafter", "seat", "lane holder", "owner", "admin",
//     role names): the page speaks as its author.
// `book_line` on a source is tolerated and ignored (line numbers move with every version; the page links the note).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const override = process.env.IMMUNITY_TIMELINE_JSON;
const FILE = override && !process.env.NETLIFY && !process.env.CI ? resolve(override) : join(ROOT, 'public', 'research', 'immunity-timeline.json');
const CATEGORIES = new Set(['older-record', 'english-origin', 'sovereign', 'state-sovereign', 'foreign-sovereign', 'judicial', 'legislative', 'executive-absolute', 'qualified', 'prosecutorial', 'municipal', 'statute', 'repudiation']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = new Set(['decision', 'statute', 'constitutional-text', 'report', 'treatise', 'event']);
// coordination vocabulary only: the words the sites' seats use of one another. Plain English words that also occur in the
// law ("seat of judgment", "the owner of the ship", "Lane v. Cotton") are not in this list, and a seat id is eight hex
// characters standing alone.
const VOICE = /\b(drafter|lane holder|website-developer|studio-spec|frontend-developer|docx-specialist|deck-push|check_links|registry\.py)\b|(?<![0-9a-f§\w])[0-9a-f]{8}(?![0-9a-f\w])/i;

if (!existsSync(FILE)) { console.log('timeline validation PASSED — no public/research/immunity-timeline.json (the route answers 404).'); process.exit(0); }

const errors = [];
const err = (m) => errors.push(m);
let t;
try { t = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) { console.error(`timeline validation FAILED: unparsable (${e.message})`); process.exit(1); }

const text = (label, s) => { if (typeof s === 'string' && VOICE.test(s)) err(`${label}: coordination vocabulary in reader-facing text — "${s.match(VOICE)[0]}"`); };
for (const k of ['title', 'standfirst']) if (typeof t[k] !== 'string' || !t[k].trim()) err(`header: ${k} missing`); else text(`header.${k}`, t[k]);
if (t.comparison_line) text('header.comparison_line', t.comparison_line);
const prov = t.provenance ?? {};
for (const k of ['book_title', 'book_slug', 'date']) if (typeof prov[k] !== 'string' || !prov[k].trim()) err(`provenance.${k} missing`);
if (!Array.isArray(t.entries) || t.entries.length === 0) err('entries: empty or missing');

const ids = new Set();
for (const [i, e] of (t.entries ?? []).entries()) {
  const at = `entries[${i}]${e?.id ? ` (${e.id})` : ''}`;
  if (!e || typeof e !== 'object') { err(`${at}: not an object`); continue; }
  for (const k of ['id', 'date_text', 'title', 'summary']) if (typeof e[k] !== 'string' || !e[k].trim()) err(`${at}: ${k} missing`);
  if (typeof e.id === 'string') { if (!SLUG.test(e.id)) err(`${at}: id is not a slug`); if (ids.has(e.id)) err(`${at}: duplicate id`); ids.add(e.id); }
  if (!Number.isInteger(e.year)) err(`${at}: year is not an integer`);
  if (e.year_end != null && (!Number.isInteger(e.year_end) || e.year_end < e.year)) err(`${at}: year_end is not an integer at or after year`);
  if (!CATEGORIES.has(e.category)) err(`${at}: category "${e.category}" is not one of the closed set`);
  if (e.kind != null && !KINDS.has(e.kind)) err(`${at}: kind "${e.kind}" is not one of decision · statute · constitutional-text · report · treatise · event`);
  if (!e.source || typeof e.source.cite !== 'string' || !e.source.cite.trim()) err(`${at}: source.cite missing`);
  if (e.quote && !e.quote_pin) err(`${at}: a quote needs its pin (quote_pin)`);
  if (e.link != null && !/^https?:\/\//.test(String(e.link))) err(`${at}: link is not http(s)`);
  if (e.source?.book_note != null && !/^[a-z0-9_]+$/i.test(String(e.source.book_note))) err(`${at}: source.book_note is not a note id`);
  if (e.source?.book_unit != null) {
    const u = String(e.source.book_unit);
    if (!/^[a-z0-9_]+\/[0-9]+$/i.test(u)) err(`${at}: source.book_unit "${u}" is not <note>/<seq>`);
    else if (!e.source.book_note || !u.startsWith(`${e.source.book_note}/`)) err(`${at}: source.book_unit "${u}" does not begin with its book_note`);
  }
  for (const k of ['title', 'summary', 'quote', 'date_text']) text(`${at}.${k}`, e[k]);
  if (e.source) for (const k of ['cite', 'pin']) text(`${at}.source.${k}`, e.source[k]);
}
for (const [i, s] of (t.comparison ?? []).entries()) {
  const at = `comparison[${i}]`;
  if (!Number.isInteger(s.step)) err(`${at}: step is not an integer`);
  for (const k of ['label', 'their_title', 'their_claim', 'correction']) if (typeof s[k] !== 'string' || !s[k].trim()) err(`${at}: ${k} missing`);
  text(`${at}.correction`, s.correction);
  for (const id of s.entry_ids ?? []) if (!ids.has(id)) err(`${at}: entry_id "${id}" resolves to no entry`);
}

if (errors.length) { console.error(`timeline validation FAILED — ${errors.length} problem(s):`); for (const m of errors) console.error('  - ' + m); process.exit(1); }
const withNote = (t.entries ?? []).filter((e) => e.source?.book_note).length;
const withKind = (t.entries ?? []).filter((e) => e.kind).length;
const withUnit = (t.entries ?? []).filter((e) => e.source?.book_unit).length;
console.log(`timeline validation PASSED — ${t.entries.length} entries (${withNote} linked to a book note, ${withUnit} to a cited unit, ${withKind} with a kind), ${(t.comparison ?? []).length} comparison steps (not drawn)${override ? ` [from ${FILE}]` : ''}.`);
