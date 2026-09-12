// scripts/validate-readings.mjs — build gate for content/readings/*.json
// (Open Readings; plan §2.5). Fails the build (exit 1) on:
//   - malformed/duplicate ids; missing required fields; bad legibility;
//   - a question that is not exactly one sentence ending in "?";
//   - licence without name/attribution/republish; region outside the image
//     box (IIIF !2000,2000 → 2000 unless image.width/height given);
//   - a crop present when republish=false, or crop hash mismatch vs the
//     generated crops manifest (when the manifest exists);
//   - answers files: unknown item ids, bad letters, and ANY contact-like
//     field (email/contact/phone/ip) — readers' details never enter the repo.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'content', 'readings');
const CROPS = join(ROOT, 'public', 'uploads', 'readings');
const REQ = ['id', 'collection', 'shelfmark', 'leaf', 'line', 'source', 'image', 'region', 'zoom', 'transcription', 'comparison', 'question', 'legibility', 'language', 'licence', 'created'];
const LEGIBILITY = new Set(['readable', 'uncertain', 'illegible-at-this-resolution']);
const CONTACT = /^(e-?mail|contact|phone|tel|ip|ip_hash|address|reader_email|reader_contact)$/i;

const errors = [];
const err = (m) => errors.push(m);
if (!existsSync(DIR)) {
  console.log('readings validation PASSED — no content/readings directory.');
  process.exit(0);
}
// Underscore-prefixed files are build products (_store-export.json), never collections.
const files = readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
const itemFiles = files.filter(f => !f.endsWith('.answers.json') && !f.endsWith('.meta.json'));
const allIds = new Map();
let itemTotal = 0, answerTotal = 0;

for (const f of itemFiles) {
  const collection = f.replace(/\.json$/, '');
  let data;
  try { data = JSON.parse(readFileSync(join(DIR, f), 'utf8')); } catch (e) { err(`${f}: unparsable (${e.message})`); continue; }
  const items = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(items)) { err(`${f}: no items array`); continue; }
  let cropManifest = null;
  const cmPath = join(CROPS, collection, 'crops.manifest.json');
  if (existsSync(cmPath)) { try { cropManifest = JSON.parse(readFileSync(cmPath, 'utf8')); } catch { err(`${collection}: crops.manifest.json unparsable`); } }
  for (const [i, it] of items.entries()) {
    const where = `${f} items[${i}]${it?.id ? ` (${it.id})` : ''}`;
    for (const k of REQ) if (it?.[k] === undefined || it[k] === null || it[k] === '') err(`${where}: missing "${k}"`);
    if (!it) continue;
    itemTotal += 1;
    if (typeof it.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.id)) err(`${where}: id must be a lowercase-hyphen slug`);
    if (allIds.has(it.id)) err(`${where}: duplicate id (also in ${allIds.get(it.id)})`);
    allIds.set(it.id, f);
    if (it.collection !== collection) err(`${where}: collection "${it.collection}" ≠ file "${collection}"`);
    if (!LEGIBILITY.has(it.legibility)) err(`${where}: legibility "${it.legibility}"`);
    if (typeof it.question !== 'string' || !it.question.trim().endsWith('?') || (it.question.match(/\?/g) || []).length !== 1) err(`${where}: question must be one sentence ending in "?"`);
    if (it.context !== undefined && (typeof it.context !== 'string' || !it.context.trim())) err(`${where}: context, if present, must be non-empty`);
    const s = it.source || {};
    if (s.kind === 'archive') { if (!s.archiveId || !s.leafId) err(`${where}: archive source needs archiveId + leafId`); }
    else if (s.kind === 'external') { if (!/^https:\/\//.test(s.href || '') || !s.holder) err(`${where}: external source needs https href + holder`); }
    else err(`${where}: source.kind must be archive|external`);
    if (!/^[0-9a-f]{64}$/.test(it.image?.sha256 || '')) err(`${where}: image.sha256 malformed`);
    const W = it.image?.width ?? 2000, H = it.image?.height ?? 2000;
    const r = it.region || {};
    if (!['x', 'y', 'w', 'h'].every(k => Number.isInteger(r[k]) && r[k] >= 0) || r.w === 0 || r.h === 0) err(`${where}: region must be non-negative integers with w,h > 0`);
    else if (r.x + r.w > W || r.y + r.h > H) err(`${where}: region exceeds the ${W}×${H} image`);
    if (!(Number.isFinite(it.zoom) && it.zoom >= 1 && it.zoom <= 8)) err(`${where}: zoom must be 1..8`);
    for (const side of ['transcription', 'comparison']) { const t = it[side] || {}; if (!t.text || !t.lang) err(`${where}: ${side} needs text + lang`); }
    const lic = it.licence || {};
    if (!lic.name || !lic.attribution || typeof lic.republish !== 'boolean') err(`${where}: licence needs name, attribution, republish(boolean)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.created || '')) err(`${where}: created must be YYYY-MM-DD`);
    if (it.resolution && (!it.resolution.decision || !/^\d{4}-\d{2}-\d{2}$/.test(it.resolution.date || ''))) err(`${where}: resolution needs decision + date`);
    const cropPath = join(CROPS, collection, `${it.id}.jpg`);
    if (lic.republish === false && existsSync(cropPath)) err(`${where}: licence forbids republication but a crop exists (${cropPath})`);
    if (cropManifest && lic.republish !== false) {
      const entry = cropManifest.crops?.[it.id];
      if (!entry) err(`${where}: no crop in crops.manifest.json (run build-reading-crops)`);
      else if (!existsSync(cropPath)) err(`${where}: crop listed but file missing`);
      else {
        const sha = createHash('sha256').update(readFileSync(cropPath)).digest('hex');
        if (sha !== entry.sha256) err(`${where}: crop sha256 mismatch (regenerate crops)`);
        if (entry.source_sha256 !== it.image.sha256 || JSON.stringify(entry.region) !== JSON.stringify(it.region)) err(`${where}: crop was cut from a different source/region (regenerate crops)`);
      }
    }
    for (const k of Object.keys(it)) if (CONTACT.test(k)) err(`${where}: contact-like field "${k}" is not allowed on items`);
  }
}

for (const f of files.filter(f => f.endsWith('.answers.json'))) {
  const collection = f.replace(/\.answers\.json$/, '');
  let data;
  try { data = JSON.parse(readFileSync(join(DIR, f), 'utf8')); } catch (e) { err(`${f}: unparsable (${e.message})`); continue; }
  const answers = Array.isArray(data) ? data : data.answers;
  if (!Array.isArray(answers)) { err(`${f}: no answers array`); continue; }
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${where}[${i}]`));
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (CONTACT.test(k)) err(`${where}.${k}: contact-like field in a PUBLISHED answers file — refused`); walk(v, `${where}.${k}`); }
  };
  walk(answers, f);
  for (const [i, a] of answers.entries()) {
    const where = `${f} answers[${i}]`;
    answerTotal += 1;
    if (!allIds.has(a.item_id) || allIds.get(a.item_id) !== `${collection}.json`) err(`${where}: item_id "${a.item_id}" not in ${collection}.json`);
    if (!['A', 'B', 'C', 'D'].includes(a.letter)) err(`${where}: letter must be A|B|C|D`);
    if (a.letter === 'C' && !a.reading) err(`${where}: letter C needs a reading`);
    if (!a.reader?.display) err(`${where}: reader.display required ("anonymous reader" for anonymity)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.published || '')) err(`${where}: published must be YYYY-MM-DD`);
    if (a.note && a.note.length > 1000) err(`${where}: note exceeds 1000 chars`);
    if (a.id !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(String(a.id))) err(`${where}: id must be the submission id ([A-Za-z0-9_-])`);
    for (const k of Object.keys(a)) if (!['id', 'item_id', 'letter', 'reading', 'note', 'reader', 'published', 'ack'].includes(k)) err(`${where}: unknown field "${k}"`);
  }
}

if (errors.length) {
  console.error('readings validation FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`readings validation PASSED — ${itemFiles.length} collection(s), ${itemTotal} item(s), ${answerTotal} published answer(s).`);
