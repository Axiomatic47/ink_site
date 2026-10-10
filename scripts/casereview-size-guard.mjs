// scripts/casereview-size-guard.mjs — kirchner.ink's guard before a Case Review import lands: GitHub refuses any
// file over 100 MB on push (this repo carries no LFS, and Netlify would not resolve LFS pointers), so a registry row whose
// served file is that large cannot ride the branch. Run it on the checker's export BEFORE `import-casereview.mjs`: it reads
// the export's docs.json, measures every `serve` row's file on disk, and exits 1 naming any over the bound, so the chain
// stops here and not at the push (2026-10-10: MN registry v0s's 1920 Biennial Report scan, 197 MB, refused by GitHub's
// pre-receive hook on kirchner.ink; the same wall here). The bound is 95 MB to leave room under the limit. The answer for
// such a row is the registry's own publish word — `link` with a publish_url — never a quiet drop here.
//   node scripts/casereview-size-guard.mjs --from <export dir> [--max-mb 95] [--case-root <dir>]
import { readFileSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const from = opt('--from', null);
if (!from) { console.error('usage: node scripts/casereview-size-guard.mjs --from <export dir> [--max-mb 95]'); process.exit(2); }
const maxBytes = Math.round(Number(opt('--max-mb', '95')) * 1024 * 1024);
const docs = JSON.parse(readFileSync(join(from, 'docs.json'), 'utf8'));
// the case root the importer resolves against: the export stamp's, else --case-root (docs.json's case_root is the SLUG)
let stamp = null; try { stamp = JSON.parse(readFileSync(join(from, '_EXPORT.json'), 'utf8')); } catch {}
const caseRoot = opt('--case-root', null) || (stamp && stamp.case_root) || null;
if (!caseRoot) { console.error('size guard: no case root (no _EXPORT.json in the export; pass --case-root)'); process.exit(2); }
let checked = 0; const over = [];
for (const d of docs.docs || []) {
  if (d.publish !== 'serve' || !d.path) continue;
  const p = isAbsolute(d.path) ? d.path : resolve(caseRoot, d.path);
  let bytes = null;
  try { bytes = statSync(p).size; } catch { continue; }   // the importer's own sha gate speaks to a missing file
  checked++;
  if (bytes > maxBytes) over.push({ id: d.id, bytes });
}
if (over.length) {
  console.error(`size guard: ${over.length} served file(s) over ${(maxBytes / 1048576).toFixed(0)} MB cannot ride git — hold the import and ask the registry for 'link' + publish_url:`);
  for (const o of over) console.error(`  ${(o.bytes / 1048576).toFixed(1)} MB  ${o.id}`);
  process.exit(1);
}
console.log(`size guard: ${checked} served file(s) measured, none over ${(maxBytes / 1048576).toFixed(0)} MB`);
