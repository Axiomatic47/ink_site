#!/usr/bin/env node
// scripts/sync-casereview.mjs — the Studio's Case Review window, vendored byte for byte.
//
//   node scripts/sync-casereview.mjs --check          # the files under public/ match VENDOR.json and its pdf.js pin; the window's
//                                                     #    imports from the shims are covered by the shims' exports (every build)
//   node scripts/sync-casereview.mjs --check --source # …and VENDOR.json matches the Studio checkout at its recorded commit:
//                                                     #    the blobs, the fixture's `pdfjs` section, and the Studio harness run there
//   node scripts/sync-casereview.mjs --sync           # copy from the Studio checkout at its HEAD, rewrite VENDOR.json (pin included)
//
// The site never edits these files: the Studio (~/Git/ourstudio) is the source of every rule; a change lands there
// first and syncs out. `--check` needs nothing but this repo (Netlify runs it); `--source` and `--sync` need the
// Studio checkout (STUDIO_DIR, default ~/Git/ourstudio) and run on the device only.
//
// THE PIN (studio-spec fbf555d9's R2, 2026-10-01; frontend-developer a168bcf6's b5539b95): the Studio fixture
// tests/fixtures/casereview_fold.json carries a `pdfjs` section — version, sha256 of pdf.min.mjs and the worker, the
// standard fonts by name and digest. The Studio's harness asserts it against ui/lib/pdfjs; this script asserts the
// same section against the vendored copy, so drift fails the build on either side. An upgrade is ONE Studio patch
// moving the pin and the files together.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const RECORD = path.join(PUBLIC, 'casereview', 'vendor', 'VENDOR.json');
const FIXTURE = 'tests/fixtures/casereview_fold.json';
const FONTS_DIR = 'lib/pdfjs/standard_fonts';
const STUDIO = process.env.STUDIO_DIR || path.join(os.homedir(), 'Git', 'ourstudio');
const args = new Set(process.argv.slice(2));

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const read = (p) => fs.readFileSync(p);
const fail = (msg) => { console.error(`sync-casereview: ${msg}`); process.exit(1); };
const short = (h) => String(h || '').slice(0, 8);

function loadRecord() { return JSON.parse(fs.readFileSync(RECORD, 'utf8')); }
function git(...a) { return execFileSync('git', ['-C', STUDIO, ...a], { encoding: 'buffer', maxBuffer: 64 << 20 }); }
function needStudio() { if (!fs.existsSync(path.join(STUDIO, '.git'))) fail(`no Studio checkout at ${STUDIO} (set STUDIO_DIR)`); }

/** The window's named imports from the shims against what the shims export. A name the Studio's window starts
 *  importing that the site's shim does not export fails the module graph at link time — the whole window, silently,
 *  on the page — so it fails here first, in words (2026-10-02, ahead of the right pane's tab bar: the shared menu may
 *  gain an import). Named imports only; the window uses no default or namespace imports from the shims. */
function shimCoverage(rec) {
  let bad = 0;
  const shims = rec.shims || {};
  const importRe = /^\s*import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gm;
  const exportsOf = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) { const as = part.trim().split(/\s+as\s+/); const n = (as[1] || as[0]).trim(); if (n) names.add(n); }
    return names;
  };
  for (const rel of Object.keys(rec.files)) {
    if (!rel.endsWith('.js') || !rel.startsWith('casereview/')) continue;
    const p = path.join(PUBLIC, rel);
    if (!fs.existsSync(p)) continue;                                    // reported by the file check above
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(importRe)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2]));
      if (!Object.prototype.hasOwnProperty.call(shims, target)) continue; // a vendored module, not a shim
      const shimPath = path.join(PUBLIC, target);
      if (!fs.existsSync(shimPath)) continue;                             // reported above
      const have = exportsOf(fs.readFileSync(shimPath, 'utf8'));
      const want = m[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(/\s+as\s+/)[0].trim());
      const missing = want.filter((n) => !have.has(n));
      if (missing.length) { console.error(`  SHIM     ${target} exports no ${missing.join(', ')} — ${rel} imports it; add it to the shim before this sync lands`); bad++; }
      else console.log(`  shim     ${target} ← ${rel} imports {${want.join(', ')}}: covered`);
    }
  }
  return bad;
}

/** The vendored files and the pin against the record alone (no Studio needed). */
// THE STAMP BESIDE THE RECORD (studio-spec 7d866ecf's ask, 2026-10-05; informational, never a refusal): the bundle's stamp names
// the Studio commit its export ran at and the checker's label (and, once P91a lands, the checker's source sha256); the record names
// the commit the window was copied at. They differ whenever one moved without the other — 79b8fd3a's bundle under 783accd9's window
// on 10-05, bodies identical — a fact a reader should see, not a fault this check should refuse: the window's identity is the blobs
// above, the bundle's is the importer's --check. No pin is read here: one enforcement point, where the source changes (the Studio's suite).
function stampLine(rec) {
  const p = path.join(PUBLIC, 'casereview', 'data', '_IMPORT.json');
  if (!fs.existsSync(p)) { console.log('  stamp    no bundle at public/casereview/data/_IMPORT.json (the importer writes it)'); return; }
  let imp; try { imp = JSON.parse(read(p)); } catch { console.log("  stamp    _IMPORT.json unreadable — the importer's --check says why"); return; }
  const ex = imp.export_stamp || {};
  const bundleAt = ex.ourstudio_commit ? String(ex.ourstudio_commit) : (imp.vendored_studio_commit ? short(imp.vendored_studio_commit) : '?');
  const windowAt = (rec.source && rec.source.commit) ? short(rec.source.commit) : '?';
  const same = bundleAt !== '?' && windowAt !== '?' && bundleAt.slice(0, 7) === windowAt.slice(0, 7);
  const src = ex.checker_source_sha256 ? ` · source ${short(String(ex.checker_source_sha256))}…` : '';
  // P94 (studio-spec 7d866ecf, 2026-10-06): the export signs the SHELF its passages were read from — one sha256 over the
  // machine_read bytes of every document a quoted row targets. It rides the stamp whole, like the checker's source before it;
  // printed here so a reader of the check sees all three identities a bundle was built under, label included.
  const mir = ex.mirrors_sha256 ? ` · mirrors ${short(String(ex.mirrors_sha256))}…` : '';
  console.log(`  stamp    bundle: ourstudio ${bundleAt} · checker ${ex.checker || '?'}${src}${mir} · registry ${ex.registry_version || imp.registry_version || '?'} | window: ${windowAt}${same ? ' — one Studio commit' : ' — DIFFERENT Studio commits (the window and the bundle were taken at different heads: a fact to see, not a fault)'}`);
}
function check(rec) {
  let bad = 0;
  for (const [rel, f] of Object.entries(rec.files)) {
    const p = path.join(PUBLIC, rel);
    if (!fs.existsSync(p)) { console.error(`  missing  ${rel}`); bad++; continue; }
    const h = sha256(read(p));
    if (h !== f.sha256) { console.error(`  DRIFT    ${rel}\n           on disk ${h}\n           record  ${f.sha256}`); bad++; }
    else console.log(`  ok       ${rel}`);
  }
  for (const rel of Object.keys(rec.shims || {})) {
    if (!fs.existsSync(path.join(PUBLIC, rel))) { console.error(`  missing  ${rel} (a shim the window imports)`); bad++; }
    else console.log(`  shim     ${rel}`);
  }
  bad += shimCoverage(rec);
  const pin = rec.pdfjs_pin || {};
  if (!pin.version || !pin.files) { console.error('  NO PIN   VENDOR.json carries no pdfjs_pin — run --sync from the Studio checkout'); return bad + 1; }
  for (const [name, digest] of Object.entries(pin.files)) {
    const rel = `lib/pdfjs/${name}`;
    const p = path.join(PUBLIC, rel);
    const h = fs.existsSync(p) ? sha256(read(p)) : null;
    if (h !== digest) { console.error(`  PIN      ${rel}: the fixture pins ${short(digest)}…, on disk ${h ? short(h) + '…' : 'missing'}`); bad++; }
    else console.log(`  pin      ${rel} = ${short(digest)}… (pdf.js ${pin.version})`);
  }
  const fontsDir = path.join(PUBLIC, FONTS_DIR);
  const fonts = pin.standard_fonts || {};
  let fontsOk = 0;
  for (const [name, digest] of Object.entries(fonts)) {
    const p = path.join(fontsDir, name);
    const h = fs.existsSync(p) ? sha256(read(p)) : null;
    if (h !== digest) { console.error(`  PIN      ${FONTS_DIR}/${name}: pinned ${short(digest)}…, on disk ${h ? short(h) + '…' : 'missing'}`); bad++; }
    else fontsOk++;
  }
  console.log(`  pin      ${FONTS_DIR}/ — ${fontsOk} of ${Object.keys(fonts).length} standard fonts by digest`);
  stampLine(rec);
  return bad;
}

/** The record against the Studio checkout at the recorded commit: the blobs, the fixture's pin, the harness. */
function checkSource(rec) {
  needStudio();
  let bad = 0;
  const c = rec.source.commit;
  for (const [rel, f] of Object.entries(rec.files)) {
    let blob;
    try { blob = git('show', `${c}:${f.from}`); }
    catch { console.error(`  no blob  ${f.from} at ${short(c)}`); bad++; continue; }
    const h = sha256(blob);
    if (h !== f.sha256) { console.error(`  RECORD≠SOURCE ${rel}: the Studio blob at ${short(c)} is ${h}`); bad++; }
    else console.log(`  source   ${rel} = ${f.from} @ ${short(c)}`);
  }
  // the fixture's pin at the recorded commit must be the record's pin
  let fx = null;
  try { fx = JSON.parse(git('show', `${c}:${FIXTURE}`).toString('utf8')).pdfjs || null; } catch { fx = null; }
  if (!fx) { console.error(`  no pin   ${FIXTURE} at ${short(c)} carries no pdfjs section`); bad++; }
  else {
    const same = JSON.stringify({ v: fx.version, f: fx.files, s: fx.standard_fonts }) === JSON.stringify({ v: rec.pdfjs_pin.version, f: rec.pdfjs_pin.files, s: rec.pdfjs_pin.standard_fonts });
    if (!same) { console.error(`  PIN≠FIXTURE the record's pdfjs_pin is not the fixture's section at ${short(c)} — run --sync`); bad++; }
    else console.log(`  fixture  ${FIXTURE} @ ${short(c)}: the pin is the record's (pdf.js ${fx.version}, ${Object.keys(fx.standard_fonts || {}).length} fonts)`);
  }
  // the Studio's harness, in the Studio checkout — its pins cover the vendored copy by blob identity (a168bcf6's rule:
  // the harness reads the whole ui tree by relative path; it runs where it lives, never against a rewritten path)
  const head = git('rev-parse', 'HEAD').toString().trim();
  if (head === c) {
    try {
      const out = execFileSync('node', ['tests/js/casereview_test.harness.mjs'], { cwd: STUDIO, encoding: 'utf8', maxBuffer: 64 << 20 });
      const last = out.trim().split('\n').pop();
      console.log(`  harness  ${last} (in ${STUDIO} @ ${short(head)})`);
    } catch (e) { console.error(`  HARNESS  failed in the Studio checkout:\n${String(e.stdout || e.message).trim().split('\n').slice(-6).map(l => '           ' + l).join('\n')}`); bad++; }
  } else {
    const touching = git('log', '--oneline', `${c}..HEAD`, '--', ...Object.values(rec.files).map(f => f.from), ...Object.values(rec.dirs || {}).map(d => d.from), FIXTURE).toString().trim();
    console.log(`  harness  not run: the Studio HEAD is ${short(head)}, the record ${short(c)} — the blobs above cover the copy by identity`);
    if (touching) console.log(`  NOTE     the Studio has newer commits touching the vendored files or the fixture (a sync is a decision, not a drift):\n${touching.split('\n').map(l => '           ' + l).join('\n')}`);
  }
  return bad;
}

/** Copy from the Studio at its HEAD; rewrite the record and the pin. */
function sync(rec) {
  needStudio();
  const srcs = [...Object.values(rec.files).map(f => f.from), ...Object.values(rec.dirs || {}).map(d => d.from), FIXTURE];
  const dirty = git('status', '--porcelain', '--', ...srcs).toString().trim();
  if (dirty) fail(`the Studio's vendored sources have uncommitted changes — commit them in the Studio first:\n${dirty}`);
  const head = git('rev-parse', 'HEAD').toString().trim();
  const changed = git('log', '-1', '--format=%H', '--', ...srcs).toString().trim();
  for (const [rel, f] of Object.entries(rec.files)) {
    const src = path.join(STUDIO, f.from), dst = path.join(PUBLIC, rel);
    const buf = read(src);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
    const h = sha256(buf);
    console.log(`  ${h === f.sha256 ? 'same    ' : 'UPDATED '} ${rel}`);
    f.sha256 = h;
  }
  for (const [rel, d] of Object.entries(rec.dirs || {})) {
    const src = path.join(STUDIO, d.from), dst = path.join(PUBLIC, rel);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    console.log(`  copied   ${rel}/ (${fs.readdirSync(dst).length} files)`);
  }
  const fx = JSON.parse(fs.readFileSync(path.join(STUDIO, FIXTURE), 'utf8')).pdfjs;
  if (!fx) fail(`${FIXTURE} carries no pdfjs section — the pin is missing in the Studio`);
  rec.pdfjs_pin = { note: rec.pdfjs_pin && rec.pdfjs_pin.note, version: fx.version, files: fx.files, standard_fonts: fx.standard_fonts, why: fx.why };
  for (const f of Object.values(rec.files)) if (f.version) f.version = fx.version;
  rec.source.commit = head;
  rec.source.files_last_changed = changed;
  rec.source.vendored = new Date().toISOString();
  fs.writeFileSync(RECORD, JSON.stringify(rec, null, 2) + '\n');
  console.log(`  record   ${path.relative(ROOT, RECORD)} → ${short(head)}`);
}

const rec = loadRecord();
if (args.has('--sync')) { sync(rec); console.log('synced; run --check --source to prove the record'); process.exit(0); }
let bad = check(rec);
if (args.has('--source')) bad += checkSource(rec);
if (bad) fail(`${bad} problem(s) — the vendored files are not the Studio's (see above); run --sync from the Studio checkout, never edit them here`);
console.log(`vendored Case Review window is the Studio's at ${short(rec.source.commit)} (pdf.js ${rec.pdfjs_pin.version})`);
