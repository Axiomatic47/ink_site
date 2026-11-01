#!/usr/bin/env node
// scripts/import-casereview.mjs — the Case Review BUNDLE: the lane as the Studio serves it, published by the registry's
// word. The vendored window reads the Studio's three API routes; on the site those routes are static files behind
// rewrites (public/_redirects for Netlify, public/serve.json for the local static server), so the window's requests
// are the Studio's own and nothing in it changes:
//
//   /api/casereview/docs         → /casereview/data/docs.json            the registry + per-table link counts
//   /api/casereview/links/<id>   → /casereview/data/links/<id>.json      one table, every row as the checker served it
//   /api/casereview/file/<id>    → /uploads/<case>/<id>.pdf              the PDF, sha-gated against the registry
//
//   node scripts/import-casereview.mjs                        # from the running Studio (http://127.0.0.1:8765), work_station
//   node scripts/import-casereview.mjs --from <export_dir>    # from the checker's export (studio-spec R1) — REQUIRED for a lane with
//                                                            #   `pages` rows: the extracts are the export's (the review-mode standard § 2c)
//   node scripts/import-casereview.mjs --check                # the bundle on disk is whole (runs in every build); it carries no device path
//   node scripts/import-casereview.mjs --out <dir>            # write the bundle under <dir> instead of public/ (a dry run)
//   node scripts/import-casereview.mjs --hosts                # refresh public/casereview/hosts.json (THE HOST TABLE, the review-mode
//                                                            #   standard R4, 2026-10-21) from every bundle on disk, and the /api/casereview/cases
//                                                            #   rewrite in _redirects + serve.json — no import; idempotent
//   node scripts/import-casereview.mjs --case <slug> …        # a SECOND case on the same host (2026-10-10, the MN lane): its bundle under
//                                                             # public/casereview/<slug>/data/, its API rules keyed on the window's ?root=<slug>
//   --uploads-dir <dir under public/> --names id|docket --name-map <json>   # a host's own PDF layout (lawsofexistence.com)
//   --serve-groups Filings[,…]                                 # a HOST policy: registry serve rows of other groups are not hosted here (link if a url, else hold), stamped
//   node scripts/import-casereview.mjs --dev-serve-filings    # DEVELOPMENT ONLY — see PUBLICATION below
//
// PUBLICATION (studio-spec fbf555d9's R3, 2026-10-01; the owner's content gates of 2026-09-30): a per-row `publish`
// field in docs.json — serve | link | hold | pages, with publish_url for link — decides what the site carries. FAIL CLOSED on
// every kind, the filings included: a row without the field is `hold`. The Studio ignores the field; the export (and,
// until it lands, this importer) applies it: link → path null + url, hold → path null, the row KEPT and marked so a
// citation to it still says what it points at. The admins write the field; the owner decides the case law and the
// hosting size. `--dev-serve-filings` treats the Filings group as `serve` for a LOCAL proof of the module and is
// refused under CI/NETLIFY; a bundle it wrote is stamped and `--check` refuses to deploy it.
//
// THE `pages` WORD (the review-mode standard § 2c; D6, the owner's yes of 2026-10-21; the export half app 6312f0da + 8532906e,
// this import half the sites'): a `pages` row serves THE CITED PAGES of its file and nothing else. The export cuts them with
// qpdf into extracts/<safe id>.pdf in the bundle and makes the row describe the extract AS A DOCUMENT (path, pages = the leaf
// count, offset null, an exact-key pagemap own page → extract leaf, pagemap_basis leaf, extract_of {the whole file's sha256,
// source_pages, leaves}); files.json names the extract with `extract: true` and ITS OWN sha256; the link rows targeting it
// already cite extract leaves. Here a `pages` row is served like a `serve` row with two differences: the file is copied FROM
// THE BUNDLE (a serve file comes from the case root by the registry's path), and the sha gate reads the extract's own sha from
// files.json — the export's row still carries the registry's whole-file sha, so the served row here carries the extract's
// (the document the window opens and --check gates) with the whole file's under extract_of. A `pages` row needs the checker's
// export: the running Studio's API serves whole files and cuts no extract, so an API import with a `pages` row is refused in
// words. The stamp and the host row carry the publish counts (serve/link/hold/pages) and the extracts' count and bytes; the
// window needs no change (core.publishedAway opens any row with a path).
//
// What the bundle does not carry (the author's voice everywhere the reader reads; record and links only): the lane's
// seat fields (`by`), the drafters' and admins' working notes (`note`, meta.notes, the registry's note_v0_* keys), the
// checker's passage texts (the window boxes passages from the PDF's own text layer — the field is 60 % of the bytes
// and read by nothing on the client), filesystem paths, mirror paths, shelf aliases. The checker's structured answers
// (violations, warnings, coverage, stale_render, k, unit_id, pdf pages, section-map resolutions) ride unchanged.
//
// A DOCUMENT ROW'S KEYS ARE KEPT BY NAME (DOC_KEEP below; a key the Studio adds reaches a site only when named here), a LINK
// ROW'S by exception (ROW_DROP). `has_links` (the review-mode standard § 3, the nav word, app d2b39b36 2026-10-22: the
// Studio's docs answer says per row whether a links table exists, so the window's nav lists the reviewed documents before the
// counts arrive) is SET HERE, MASKED BY THE HOST: true only when the document's table is SERVED on this site — the export's
// word (or the counts map, when an older export carries none) AND the id in the served set — so a table withheld under the
// host policy or a held document reads false and the window never lists a reviewed group it cannot open here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PUBLIC = path.resolve(opt('--out', path.join(ROOT, 'public')));   // --out <dir>: write the bundle elsewhere (a dry run, a compare)

// TWO CASES ON ONE HOST (agreed by name 55339aa7 ⇄ f28bb754, 2026-10-10): the DEFAULT case keeps the bundle where every
// reader and URL has read it (public/casereview/data/, bare API rules, unchanged byte for byte); any other `--case <slug>`
// writes public/casereview/<slug>/data/ (links, files.json and _IMPORT.json under it) and API rules KEYED on the query the
// vendored window already sends — projRootQS() turns the page URL's ?projroot=<slug> into ?root=<slug> on all three fetches
// (casereview.js l.74–77) — written BEFORE the bare rules (Netlify: a query-conditioned rule matches only a request carrying
// exactly that parameter; the most specific rule first). The token is the case SLUG, never a path. docs.json's case_root is
// the slug too, so the window's per-case tree store (ourstudio_cr_tree:<case_root>) is distinct per case on one origin.
const DEFAULT_CASE = 'kirchner-v-johnson';
const CASE = opt('--case', DEFAULT_CASE);
const HOSTS = flag('--hosts');   // the host-table refresh alone (hosts.json + the /cases rewrite), from the bundles on disk
const KEYED = CASE !== DEFAULT_CASE;
const FROM = opt('--from', 'http://127.0.0.1:8765');
const PROJECT_ROOT = opt('--root', '/Users/everest/Git/work_station');
const CASE_ROOT_OPT = opt('--case-root', null);
const dataRel = (c) => c === DEFAULT_CASE ? path.join('casereview', 'data') : path.join('casereview', c, 'data');
const DATA_REL = dataRel(CASE);
const DATA = path.join(PUBLIC, DATA_REL);
const LINKS = path.join(DATA, 'links');
const DATA_URL = `/${DATA_REL}`;
const ROOT_QS = KEYED ? `root=${encodeURIComponent(CASE)}` : null;   // the _redirects query condition, as the window sends it
// the served PDFs' home: public/uploads/<case>/ here; a host that already holds its files elsewhere names the directory
// (relative to public/) — lawsofexistence.com: --uploads-dir uploads/constitutional/pdfs --names docket --name-map <mo-stay.json>
const UPLOADS_REL = opt('--uploads-dir', path.join('uploads', CASE)).replace(/^\/+|\/+$/g, '');
const UPLOADS = path.join(PUBLIC, UPLOADS_REL);
const UPLOADS_URL = `/${UPLOADS_REL}`;
const DEV = flag('--dev-serve-filings');
const CHECK = flag('--check');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fail = (m) => { console.error(`import-casereview: ${m}`); process.exit(1); };
const SEAT_ID = /\b[0-9a-f]{8}\b/;
// THE FILE NAME IS A URL-SAFE SLUG OF THE REGISTRY ID (+ .pdf). The window requests
// /api/casereview/file/<encodeURIComponent(id)>; a case-law stem carries spaces, commas and parentheses, and the two
// static servers treat an encoded segment differently (serve-handler re-encodes a matched :id before the lookup;
// Netlify matches the request path as sent), so an id the slug changes gets its OWN rule in both rewrite files —
// the request path as the window sends it → the slug's file — and only ids the slug leaves whole ride the splat.
const safeName = (id) => String(id).replace(/[^A-Za-z0-9._-]+/g, '_');
const fileName = (id) => { const s = String(id); if (!s || /[\/\\\x00-\x1f]/.test(s) || s === '.' || s === '..') throw new Error(`id ${JSON.stringify(s)} cannot name a file`); return `${safeName(s)}.pdf`; };
const needsRule = (d) => hostName(d) !== `${d.id}.pdf`;
// path-to-regexp (serve-handler's matcher) reads these as syntax inside a decoded source path; a backslash makes them literal
const p2r = (s) => String(s).replace(/[()[\]{}*+?:$|^\\]/g, '\\$&');
// `--names docket` (lawsofexistence.com keeps its files under the docket slug: 74.pdf, 51-54.pdf; mo-stay the exception)
const NAMES = opt('--names', 'id');
const NAME_MAP = (() => { const f = opt('--name-map', null); return f ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })();
function hostName(d) {
  if (NAME_MAP[d.id]) return NAME_MAP[d.id];
  if (NAMES === 'docket') { const m = /^ECF\s+(\d+)(?:-(\d+))?$/.exec(String(d.label || '')); if (m) return `${+m[1]}${m[2] ? `-${+m[2]}` : ''}.pdf`; }
  return fileName(d.id);
}

// ---------------------------------------------------------------- the publication decision
const MODES = new Set(['serve', 'link', 'hold', 'pages']);
const SERVED = (mode) => mode === 'serve' || mode === 'pages';   // the two words that put a file on this host
// HOST POLICY (lawsofexistence.com, 2026-10-01): `--serve-groups Filings[,Rules…]` — the registry's `serve` is the lane's
// word on what MAY be published; which groups a HOST actually hosts is the owner's hosting decision per site (the
// non-filing serve set is 537 documents, 735 MB). A serve row outside the listed groups is not hosted here: `link` when
// the registry names an http(s) publish_url, else `hold` — the row kept and the window says "not published on this
// site yet" (core.publishedAway). Without the flag every serve row is hosted, as before. Stamped in _IMPORT.json.
const SERVE_GROUPS = (() => { const v = opt('--serve-groups', null); return v ? new Set(v.split(',').map(x => x.trim()).filter(Boolean)) : null; })();
function publishOf(doc) {
  const p = doc.publish;
  if (SERVED(p) && SERVE_GROUPS && !SERVE_GROUPS.has(doc.group)) {
    const url = /^https?:\/\//.test(String(doc.publish_url || '')) ? doc.publish_url : null;
    // the host's reason in the host's words, shown by the window on the held document (studio-spec 7d866ecf, 2026-10-10:
    // `publish_note` beside `publish`; the registry may carry its own on a document it holds, the host's wins for a held group)
    return { mode: url ? 'link' : 'hold', url, by: 'host policy — the group is not hosted on this site', note: `the ${doc.group} group is not hosted on this site by the owner's decision` };
  }
  if (MODES.has(p)) return { mode: p, url: p === 'link' ? (doc.publish_url || null) : null, by: 'the registry' };
  if (DEV && doc.group === 'Filings') return { mode: 'serve', url: null, by: 'DEV OVERRIDE' };
  return { mode: 'hold', url: null, by: p == null ? 'no publish field — fail closed' : `publish ${JSON.stringify(p)} is not serve|link|hold|pages — fail closed` };
}
const FILER_COPY = /^none \(owner as-filed copy/;

// ---------------------------------------------------------------- the public shapes
const DOC_KEEP = ['id', 'label', 'title', 'kind', 'parent', 'ecf_no', 'attachment', 'filed', 'filer', 'pages', 'sha256', 'offset', 'pagemap', 'text_layer', 'group', 'inventory_page', 'ligature_drop', 'ligature_drop_density', 'publish_note', 'pagemap_basis',
  'embed', 'duration']   // the video row (studio-spec 2026-10-09 § 5.5): the embed {provider, id} and the recording's seconds;
function publicDoc(d, pub, extract = null, hasLinksHere = false) {
  const o = {};
  for (const k of DOC_KEEP) if (d[k] !== undefined) o[k] = d[k];
  o.has_links = !!hasLinksHere;   // the host's word (above): the table exists AND is served here
  if (d.pagemap_error) o.pagemap = null;   // the loader could not read the map: the window falls to the offset, as the Studio does
  if (FILER_COPY.test(String(d.stamp || ''))) { o.filer_copy = true; o.title = `${o.title || ''} · filer's copy, not the court's stamped copy`.trim(); }
  o.publish = pub.mode;
  if (pub.note) o.publish_note = pub.note;   // the host policy's reason for a held group (a registry's own note rides DOC_KEEP)
  if (pub.mode === 'link') o.publish_url = pub.url;
  o.path = SERVED(pub.mode) ? `${UPLOADS_URL}/${hostName(d)}` : null;
  if (pub.mode === 'pages' && extract) {
    // the served row describes the EXTRACT as a document: its own sha (what the window opens, what --check gates), the whole
    // file's under extract_of — the registry's path dropped, a filesystem path the bundle does not carry
    o.sha256 = extract.sha256;
    o.extract_of = { sha256: extract.extract_of.sha256, source_pages: extract.extract_of.source_pages, leaves: extract.extract_of.leaves };
  }
  return o;
}
const ROW_DROP = new Set(['by', 'note', 'passage']);
// … except on a VIDEO row (the Studio's video tab, 2026-10-09): a recording has no PDF, so the row's `passage` — the transcript
// mirror's minute, the words the tab marks beside the player — is the only text the window can show; it is kept on rows of kind
// video and dropped everywhere else as before (agreed by name 55339aa7 ⇄ f28bb754, 2026-10-10).
const ROW_KEEP_ON_VIDEO = new Set(['passage']);
function publicRow(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) if (!ROW_DROP.has(k) || (r.kind === 'video' && ROW_KEEP_ON_VIDEO.has(k))) o[k] = v;
  return o;
}
function publicTable(t) {
  const keepText = (arr) => (arr || []).filter(x => !SEAT_ID.test(typeof x === 'string' ? x : JSON.stringify(x)));
  const dropped = (t.coverage_answered || []).length - keepText(t.coverage_answered).length;
  const meta = t.meta || {};
  return {
    table: {
      doc_id: t.doc_id, file: t.file, header: t.header,
      rows: (t.rows || []).map(publicRow),
      errors: t.errors || [], warnings: t.warnings || [],
      coverage: keepText(t.coverage), coverage_answered: keepText(t.coverage_answered),
      meta: { src_doc: meta.src_doc, src_sha256: meta.src_sha256, cut: meta.cut, rows: meta.rows },
      stale_render: t.stale_render || null, counts: t.counts, ok: t.ok,
    },
    dropped,
  };
}

// ---------------------------------------------------------------- sources
async function fromApi(base) {
  const q = `?root=${encodeURIComponent(PROJECT_ROOT)}`;
  const get = async (p) => { const r = await fetch(`${base}${p}${q}`); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
  const docs = await get('/api/casereview/docs');
  const tables = {};
  for (const id of Object.keys(docs.links || {})) { process.stdout.write(`  links  ${id}\r`); tables[id] = await get(`/api/casereview/links/${encodeURIComponent(id)}`); }
  process.stdout.write('\n');
  return { docs, tables, caseRoot: docs.case_root, kind: `the Studio API at ${base}` };
}
// ---------------------------------------------------------------- no device path in a served bundle
// The Studio's export stamp names its roots absolutely (filing_root, case_root, project_root — the checker reads them);
// the served copy names each relative to the project root (the lane's folder name) or by the root's own name, the
// stamp's source names the export by its folder name and the lane's signature, and `--check` refuses any string under
// a device root in a bundle or the host table — so no import carries a machine's path again (admin 93e0ddad #29482,
// 2026-10-28: a served stamp had carried a scratchpad path with a session id in it since the 15 Oct import).
const DEVICE_ROOT = /^\/(Users|private|home|Volumes)\//;
const DEVICE_PATH_IN_JSON = /(?:^|[\s"(=])(\/(?:Users|private|home|Volumes)\/[^"]*)/m;   // a device root anywhere in a string value — after the string's start, a space, a quote, a paren or an equals, never after a letter, a digit or a dot (a URL's /home/ or /private/ is not a machine; admin 93e0ddad #29538)
function withoutDevicePaths(stamp) {
  const proj = typeof stamp.project_root === 'string' ? stamp.project_root.replace(/\/+$/, '') : null;
  const rel = (v) => {
    const w = v.replace(/\/+$/, '');
    if (proj && w === proj) return path.basename(proj);
    if (proj && w.startsWith(proj + '/')) return path.relative(proj, w);
    return path.basename(w);
  };
  const walk = (x) => Array.isArray(x) ? x.map(walk)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]))
    : typeof x === 'string' && DEVICE_ROOT.test(x) ? rel(x) : x;
  return walk(stamp);
}
/** the check's half: no string under a device root in the bundle's JSON (the stamp, docs.json, files.json, every table) */
function checkNoDevicePaths(DATA, LINKS) {
  let bad = 0;
  const files = ['_IMPORT.json', 'docs.json', 'files.json'];
  if (fs.existsSync(LINKS)) for (const n of fs.readdirSync(LINKS)) if (n.endsWith('.json')) files.push(path.join('links', n));
  for (const f of files) {
    const fp = path.join(DATA, f);
    if (!fs.existsSync(fp)) continue;
    const m = fs.readFileSync(fp, 'utf8').match(DEVICE_PATH_IN_JSON);
    if (m) { console.error(`  REFUSED  ${f} carries a device path (${m[1].slice(0, 60)}…) — a served bundle names no machine; re-import with this importer, or set the line by hand`); bad++; }
  }
  return bad;
}

function fromExport(dir) {
  const docs = JSON.parse(fs.readFileSync(path.join(dir, 'docs.json'), 'utf8'));
  const tables = {};
  for (const f of fs.readdirSync(path.join(dir, 'links'))) if (f.endsWith('.json')) tables[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, 'links', f), 'utf8'));
  let stamp = null; try { stamp = JSON.parse(fs.readFileSync(path.join(dir, '_EXPORT.json'), 'utf8')); } catch {}
  let files = null; try { files = JSON.parse(fs.readFileSync(path.join(dir, 'files.json'), 'utf8')); } catch {}
  const name = path.basename(path.resolve(dir));
  const kind = stamp && stamp.lane_signature && stamp.lane_signature.sha256
    ? `the checker's export ${name} of the lane at ${String(stamp.lane_signature.sha256).slice(0, 8)} (${stamp.registry_version || '?'}, ${stamp.checker || '?'})`
    : `the checker's export ${name}`;
  return { docs, tables, caseRoot: CASE_ROOT_OPT || (stamp && stamp.case_root) || docs.case_root, kind, stamp, files };
}

// ---------------------------------------------------------------- the check (every build)
// `--check` reads the bundle of `--case`; without `--case` it reads the default bundle AND every other case's bundle present
// under public/casereview/<slug>/data/, so the build gate covers a second case the day it lands with no script change.
// A host whose only case is a keyed one (kirchner.ink: the MN case) has no default bundle, so without `--case` the default
// is read when its stamp is present and the check fails only when no bundle of ANY case exists (agreed by name 55339aa7 ⇄
// f28bb754, 2026-10-10); `--check --case <slug>` reads that one bundle and requires it.
function check() {
  if (argv.includes('--case')) { checkOne(CASE); if (checkHosts([CASE])) fail('the host table is behind the bundle'); return; }
  const present = bundlesPresent();
  if (!present.length) fail(`no bundle: public/${dataRel(DEFAULT_CASE)}/_IMPORT.json is missing and no public/casereview/<slug>/data/_IMPORT.json is present — run the importer`);
  for (const c of present) checkOne(c);
  if (checkHosts(present)) fail('the host table is behind the bundles');
}
// the bundles on this host: the default case when its stamp is present, then every keyed case with a stamp
function bundlesPresent() {
  const out = [];
  if (fs.existsSync(path.join(PUBLIC, dataRel(DEFAULT_CASE), '_IMPORT.json'))) out.push(DEFAULT_CASE);
  const dir = path.join(PUBLIC, 'casereview');
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === 'data' || e.name === 'vendor') continue;
    if (fs.existsSync(path.join(dir, e.name, 'data', '_IMPORT.json'))) out.push(e.name);
  }
  return out;
}
function checkOne(c) {
  const DATA = path.join(PUBLIC, dataRel(c)), LINKS = path.join(DATA, 'links');
  const p = path.join(DATA, '_IMPORT.json');
  if (!fs.existsSync(p)) fail(`no bundle: public/${dataRel(c)}/_IMPORT.json is missing — run the importer`);
  const imp = JSON.parse(fs.readFileSync(p, 'utf8'));
  const deploying = !!(process.env.NETLIFY || process.env.CI);
  let bad = 0;
  bad += checkNoDevicePaths(DATA, LINKS);
  if (imp.dev_override) {
    const line = `the bundle was written under --dev-serve-filings (${imp.imported}) — a development proof, not the registry's word`;
    if (deploying) { console.error(`  REFUSED  ${line}`); bad++; } else console.warn(`  WARNING  ${line}; rerun the importer without the flag before committing the bundle`);
  }
  const docs = JSON.parse(fs.readFileSync(path.join(DATA, 'docs.json'), 'utf8'));
  let served = 0, missing = 0, wrong = 0, extracts = 0, extractBytes = 0;
  for (const d of docs.docs) {
    if (!(d.publish === 'serve' || d.publish === 'pages')) continue;
    served++;
    if (d.publish === 'pages') {
      // an EXTRACT (the pages word): the served row carries its own sha and extract_of {the whole file's sha, leaves}; a row
      // without them, or whose page count is not its leaf count, is not the export's
      extracts++;
      const x = d.extract_of;
      if (!x || !x.sha256 || !Array.isArray(x.leaves) || d.pages !== x.leaves.length) { wrong++; console.error(`  extract  ${d.id} says pages but carries no extract_of {sha256, leaves} matching its ${d.pages} page(s)`); continue; }
    }
    const f = path.join(PUBLIC, d.path.replace(/^\//, ''));
    if (!fs.existsSync(f)) { missing++; if (missing <= 5) console.error(`  missing  ${d.path} (${d.id} is published as serve)`); continue; }
    if (sha256(fs.readFileSync(f)) !== d.sha256) { wrong++; console.error(`  SHA      ${d.path} is not ${d.publish === 'pages' ? 'the export\'s extract' : 'the registry\'s'} ${d.id} (${d.sha256.slice(0, 12)}…)`); continue; }
    if (d.publish === 'pages') extractBytes += fs.statSync(f).size;
  }
  if (missing) console.error(`  ${missing} served document(s) have no file under public/ — the hosting decision (the files are gitignored until the owner's word)`);
  bad += missing + wrong;
  for (const id of Object.keys(docs.links || {})) if (!fs.existsSync(path.join(LINKS, `${id}.json`))) { console.error(`  missing  links/${id}.json`); bad++; }
  // has_links agrees with the tables served here (a bundle imported before the key carries none: nothing to check)
  for (const d of docs.docs) {
    if (d.has_links === undefined) continue;
    const servedTable = (docs.links || {})[d.id] != null;
    if (!!d.has_links !== servedTable) { console.error(`  has_links  ${d.id} says ${JSON.stringify(d.has_links)} but its table is ${servedTable ? '' : 'not '}served here`); bad++; }
  }
  for (const f of ['_redirects', 'serve.json']) if (!fs.existsSync(path.join(PUBLIC, f))) { console.error(`  missing  public/${f} (the API rewrites)`); bad++; }
  // the stamp names the vendored Studio commit it was imported under; a sync after the import leaves it stale — a warning, the bundle itself is unaffected
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'casereview', 'vendor', 'VENDOR.json'), 'utf8'));
    if (imp.vendored_studio_commit && rec.source && rec.source.commit && imp.vendored_studio_commit !== rec.source.commit) console.warn(`  WARNING  the stamp was imported under Studio ${String(imp.vendored_studio_commit).slice(0, 8)}, the vendor record is at ${String(rec.source.commit).slice(0, 8)} — re-run the importer after a sync to re-stamp (the bundle's bytes do not depend on it)`);
  } catch { /* no record: the vendor check says so */ }
  if (imp.host_policy) console.log(`  host policy: only ${(imp.host_policy.serve_groups || []).join(', ')} hosted here; held: ${(imp.host_policy.held_groups || []).join(', ') || 'none'} — ${imp.host_policy.not_hosted_here} registry serve row(s) said, not fetched`);
  if (imp.tables_withheld && imp.tables_withheld.length) console.log(`  tables withheld with their documents not served here: ${imp.tables_withheld.join(', ')}`);
  for (const id of imp.tables_withheld || []) if (fs.existsSync(path.join(LINKS, `${id}.json`)) || (docs.links || {})[id]) { console.error(`  served   links/${id}.json or its docs.links entry is present for a document not served here`); bad++; }
  if (bad) fail(`${bad} problem(s) in the bundle${c === DEFAULT_CASE ? '' : ` of ${c}`}`);
  console.log(`bundle ok${c === DEFAULT_CASE ? '' : ` (${c})`}: ${docs.docs.length} documents (${served} served${extracts ? ` of which ${extracts} as extracts, ${(extractBytes / 1048576).toFixed(1)} MiB` : ''}, ${docs.docs.filter(d => d.publish === 'link').length} linked, ${docs.docs.filter(d => d.publish === 'hold').length} held), ${Object.keys(docs.links || {}).length} link tables; imported ${imp.imported} from ${imp.source}`);
}

// ---------------------------------------------------------------- the host table (hosts.json)
// public/casereview/hosts.json — THE HOST TABLE as data (the review-mode standard R4, studio-spec 699a9f2a's frame and
// the owner's § 6, 2026-10-21): the EXACT shape of the Studio's GET /api/casereview/cases answer — {project_root, cases:
// [{name, case_root, case, version, current}]} as api/deck/casereview.py lane_cases() writes it — with the site's fields
// added per row and nothing renamed: root (null for the default bundle, else the slug), route, kind (case | lane),
// composition (the constitutional composition hosting the window, or null → the LANE PAGE), caption/docket/court or
// title, back, default_doc, imported. This importer UPSERTS the registry half of a row at every import (name, case_root,
// case, version, built, current, root, imported) and never touches the site's hand-set words; `--hosts` refreshes every
// row from the bundles on disk without importing. The same file is served at /api/casereview/cases by rewrite (the
// marked block below and next.config.ts), so the window's head row and lane picker read one shape on both hosts.
// A new lane is one JSON row and its bundle; the site has no host code per lane.
const HOSTS_PATH = path.join(PUBLIC, 'casereview', 'hosts.json');
const HOST_HAND_SET = ['route', 'kind', 'composition', 'caption', 'docket', 'court', 'title', 'back', 'default_doc'];
const CASES_RULE = '/api/casereview/cases  /casereview/hosts.json  200';
function readHosts() {
  try { return JSON.parse(fs.readFileSync(HOSTS_PATH, 'utf8')); } catch { return null; }
}
function siteName() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name || 'site'; } catch { return 'site'; }
}
/** the registry half of a row, read from a bundle on disk (docs.json + _IMPORT.json) */
function hostRowFromBundle(c) {
  const dir = path.join(PUBLIC, dataRel(c));
  const docs = JSON.parse(fs.readFileSync(path.join(dir, 'docs.json'), 'utf8'));
  let imp = {}; try { imp = JSON.parse(fs.readFileSync(path.join(dir, '_IMPORT.json'), 'utf8')); } catch {}
  const reg = docs.registry || {};
  return {
    name: c, case_root: c, case: reg.case ?? null, version: reg.version ?? null, built: reg.built ?? null,
    current: c === DEFAULT_CASE, root: c === DEFAULT_CASE ? null : c,
    imported: { at: imp.imported || null, documents: imp.documents ?? docs.docs?.length ?? null, tables: imp.tables ?? null, rows: imp.rows ?? null,
                publication: imp.publication || null, extracts: imp.extracts ? { count: imp.extracts.count ?? null, bytes: imp.extracts.bytes ?? null } : null,
                vendored_studio_commit: imp.vendored_studio_commit || null },
  };
}
/** upsert the registry half of `row` into hosts.json, keeping the site's hand-set words; a new row gets route /<name> and a kind */
function upsertHost(row) {
  const prior = readHosts() || {};
  const cases = Array.isArray(prior.cases) ? prior.cases.filter(r => r && r.name) : [];
  const have = cases.find(r => r.name === row.name);
  const hand = {};
  for (const k of HOST_HAND_SET) if (have && have[k] !== undefined) hand[k] = have[k];
  if (hand.route === undefined) hand.route = `/${row.name}`;
  if (hand.kind === undefined) hand.kind = /\bv\.\s/.test(String(row.case || '')) ? 'case' : 'lane';
  if (hand.composition === undefined) hand.composition = null;
  const next = { ...row, ...hand };
  const rows = [...cases.filter(r => r.name !== row.name), next].sort((a, b) => (a.root === null ? -1 : b.root === null ? 1 : a.name.localeCompare(b.name)));
  const doc = {
    $comment: 'THE HOST TABLE of the Case Review window on this site (the review-mode standard R4, 2026-10-21): the Studio\'s /api/casereview/cases shape with the site\'s fields per row. The importer writes name, case_root, case, version, built, current, root and imported at every import (or `--hosts` from the bundles on disk) and never touches route, kind, composition, caption, docket, court, title, back or default_doc — those are the site\'s words; set them here. A row with no bundle on disk hosts nothing. Served at /api/casereview/cases.',
    project_root: prior.project_root || siteName(),
    cases: rows,
  };
  fs.writeFileSync(HOSTS_PATH, JSON.stringify(doc, null, 2) + '\n');
  return { created: !have, row: next };
}
/** the /api/casereview/cases rewrite: into the DEFAULT block of _redirects (bare, matches under any query) — or the sole keyed
 *  block on a host with no default bundle — and into serve.json; idempotent */
function ensureCasesRule() {
  const out = [];
  const rp = path.join(PUBLIC, '_redirects');
  if (fs.existsSync(rp)) {
    let txt = fs.readFileSync(rp, 'utf8');
    if (!txt.includes(CASES_RULE)) {
      const lines = txt.split('\n');
      const defaultIdx = lines.findIndex(l => l.startsWith('# casereview BEGIN — '));
      const keyedIdx = lines.findIndex(l => l.startsWith('# casereview BEGIN '));
      const at = defaultIdx >= 0 ? defaultIdx : keyedIdx;
      if (at >= 0) { lines.splice(at + 1, 0, CASES_RULE); txt = lines.join('\n'); fs.writeFileSync(rp, txt); out.push('_redirects'); }
      else out.push('_redirects: no casereview block — run an import first');
    }
  }
  const sp = path.join(PUBLIC, 'serve.json');
  if (fs.existsSync(sp)) {
    const j = JSON.parse(fs.readFileSync(sp, 'utf8'));
    j.rewrites = Array.isArray(j.rewrites) ? j.rewrites : [];
    if (!j.rewrites.some(r => r.source === '/api/casereview/cases')) {
      j.rewrites.unshift({ source: '/api/casereview/cases', destination: '/casereview/hosts.json' });
      fs.writeFileSync(sp, JSON.stringify(j, null, 2) + '\n'); out.push('serve.json');
    }
  }
  return out;
}
function refreshHosts() {
  const present = bundlesPresent();
  if (!present.length) fail('no bundle on disk — nothing to put in hosts.json');
  for (const c of present) {
    const { created, row } = upsertHost(hostRowFromBundle(c));
    console.log(`  ${created ? 'added  ' : 'updated'} ${c}: ${row.case || '(no case sentence)'} — registry ${row.version || '?'}, route ${row.route}, kind ${row.kind}${row.composition ? `, composition ${row.composition}` : ' (lane page)'}`);
  }
  const touched = ensureCasesRule();
  console.log(`hosts.json: ${present.length} row(s) at public/casereview/hosts.json${touched.length ? `; the /api/casereview/cases rewrite added to ${touched.join(' + ')}` : '; the /api/casereview/cases rewrite already present'}`);
}
/** the check's half: every bundle on disk has a row; the /cases rewrite is in place */
function checkHosts(present) {
  let bad = 0;
  const h = readHosts();
  const rows = h && Array.isArray(h.cases) ? h.cases : [];
  if (h) { const m = JSON.stringify(h).match(DEVICE_PATH_IN_JSON); if (m) { console.error(`  REFUSED  hosts.json carries a device path (${m[1].slice(0, 60)}…) — a served host table names no machine`); bad++; } }
  for (const c of present) {
    const r = rows.find(x => x && x.name === c);
    if (!r) { console.error(`  missing  hosts.json row for ${c} — run: node scripts/import-casereview.mjs --hosts`); bad++; continue; }
    const wantRoot = c === DEFAULT_CASE ? null : c;
    if ((r.root ?? null) !== wantRoot) { console.error(`  wrong    hosts.json ${c}: root ${JSON.stringify(r.root)}, the bundle's layout says ${JSON.stringify(wantRoot)}`); bad++; }
    if (r.kind === 'case' && !(Array.isArray(r.caption) && r.caption.length === 2)) { console.error(`  wrong    hosts.json ${c}: kind case needs caption [a, b]`); bad++; }
  }
  const rp = path.join(PUBLIC, '_redirects');
  if (fs.existsSync(rp) && !fs.readFileSync(rp, 'utf8').includes(CASES_RULE)) { console.error('  missing  the /api/casereview/cases rewrite in public/_redirects — run: node scripts/import-casereview.mjs --hosts'); bad++; }
  if (!bad) console.log(`hosts ok: ${present.length} row(s) in hosts.json, the /api/casereview/cases rewrite in place`);
  return bad;
}

// ---------------------------------------------------------------- the import
async function run() {
  if (DEV && (process.env.NETLIFY || process.env.CI)) fail('--dev-serve-filings is a development flag; it is refused under CI/NETLIFY');
  const src = /^https?:\/\//.test(FROM) ? await fromApi(FROM) : fromExport(FROM);
  const { docs, tables } = src;
  const caseRoot = CASE_ROOT_OPT || src.caseRoot;
  if (!caseRoot || !fs.existsSync(caseRoot)) fail(`the case root is not on this machine: ${caseRoot} (pass --case-root)`);
  console.log(`source: ${src.kind}; case root ${caseRoot}; ${docs.docs.length} documents, ${Object.keys(tables).length} link tables`);

  // the host policy's names must equal the registry's group strings exactly (studio-spec 7d866ecf, 2026-10-10): a name no
  // document carries is refused in words — a typo would hold a whole group silently, with nothing in the window to say why
  const registryGroups = [...new Set(docs.docs.map((d) => d.group).filter(Boolean))].sort();
  if (SERVE_GROUPS) {
    const unknown = [...SERVE_GROUPS].filter((g) => !registryGroups.includes(g));
    if (unknown.length) fail(`--serve-groups names ${unknown.map((g) => JSON.stringify(g)).join(', ')} — no document in the registry carries that group string; the registry's groups are ${registryGroups.map((g) => JSON.stringify(g)).join(', ')} (the names must match exactly)`);
  }
  const heldGroups = SERVE_GROUPS ? registryGroups.filter((g) => !SERVE_GROUPS.has(g)) : [];

  // the registry's word per row
  const decided = docs.docs.map(d => ({ d, pub: publishOf(d) }));
  const byMode = { serve: 0, link: 0, hold: 0, pages: 0 };
  for (const x of decided) byMode[x.pub.mode]++;
  const overridden = decided.filter(x => x.pub.by === 'DEV OVERRIDE').length;
  const byRegistry = decided.filter(x => x.pub.by === 'the registry').length;
  const byHost = decided.filter(x => x.pub.by.startsWith('host policy')).length;
  console.log(`policy: ${byRegistry + byHost} rows carry the registry's publish field, ${decided.length - byRegistry - byHost} without one${DEV ? '' : ' (held)'}`);
  if (DEV) console.warn(`DEVELOPMENT OVERRIDE: ${overridden} Filings rows without a publish field treated as serve — not the registry's word`);
  const hostHeld = byHost;
  if (SERVE_GROUPS) console.log(`host policy: only ${[...SERVE_GROUPS].join(', ')} hosted here; held: ${heldGroups.join(', ') || 'none'} — ${hostHeld} serve row(s) of other groups said, not fetched`);
  console.log(`publication: serve ${byMode.serve} · link ${byMode.link} · hold ${byMode.hold} · pages ${byMode.pages}`);
  // a `pages` row's extract is the export's: the manifest entry (files.json — extract: true, the extract's own sha, extract_of)
  // and the file under extracts/; the running Studio's API carries neither, so a pages row from it is refused in words
  const extractOf = (d) => { const x = src.files && src.files[d.id]; return x && x.extract === true && x.extract_of && x.sha256 ? x : null; };
  const pagesRows = decided.filter(({ pub }) => pub.mode === 'pages');
  if (pagesRows.length && !src.files) fail(`${pagesRows.length} row(s) say pages, but ${src.kind} carries no files.json — a pages row needs the checker's export (--from <dir>), which cuts the extracts`);

  fs.mkdirSync(LINKS, { recursive: true });
  fs.mkdirSync(UPLOADS, { recursive: true });

  // the served PDFs, sha-gated against the registry (the render binding: a file that is not the registry's is not served)
  let copied = 0, kept = 0, refused = 0, extracts = 0, extractBytes = 0;
  const served = new Set();
  for (const { d, pub } of decided) {
    if (!SERVED(pub.mode)) continue;
    if (!d.path) { console.error(`  no path  ${d.id} is ${pub.mode} but the ${pub.mode === 'pages' ? 'export' : 'registry'} has no path`); refused++; continue; }
    // a serve file from the case root by the registry's path, gated on the registry's sha; an EXTRACT from the bundle by the
    // export's path, gated on the extract's own sha (files.json), and the extract must be of the registry's file
    const x = pub.mode === 'pages' ? extractOf(d) : null;
    if (pub.mode === 'pages' && !x) { console.error(`  no extract  ${d.id} says pages but files.json names no extract for it (extract: true, sha256, extract_of) — the export cut none`); refused++; continue; }
    if (x && x.extract_of.sha256 !== d.sha256) { console.error(`  SHA      ${d.id}: the extract is of ${String(x.extract_of.sha256).slice(0, 12)}…, the registry's file is ${String(d.sha256).slice(0, 12)}… — not served`); refused++; continue; }
    const want = x ? x.sha256 : d.sha256;
    const from = x ? path.resolve(FROM, d.path) : path.resolve(caseRoot, d.path);
    const name = hostName(d);
    const to = path.join(UPLOADS, name);
    if (!fs.existsSync(from)) { console.error(`  absent   ${d.id}: ${from}`); refused++; continue; }
    if (x) extracts++;
    if (fs.existsSync(to) && sha256(fs.readFileSync(to)) === want) { kept++; served.add(name); if (x) extractBytes += fs.statSync(to).size; continue; }
    const buf = fs.readFileSync(from);
    const h = sha256(buf);
    if (h !== want) { console.error(`  SHA      ${d.id}: the file on disk is ${h.slice(0, 12)}…, ${x ? 'files.json says the extract is' : 'the registry says'} ${String(want).slice(0, 12)}… — not served`); refused++; continue; }
    if (x) extractBytes += buf.length;
    fs.mkdirSync(path.dirname(to), { recursive: true });   // a host name with a subdirectory (a name map's value) on a fresh host
    fs.writeFileSync(to, buf);
    copied++; served.add(name);
  }
  // prune what is no longer served
  // prune only what THIS import would name for a document no longer served — a host's other files in a shared directory stay
  let pruned = 0;
  const mine = new Set(decided.map(({ d }) => { try { return hostName(d); } catch { return null; } }).filter(Boolean));
  // … and never a name ANOTHER bundle on this host serves at the same path (the opinions two registries share map to one file on
  // lawsofexistence.com; agreed by name 55339aa7 ⇄ f28bb754, 2026-10-10): the union of every other bundle's files.json
  const servedElsewhere = new Set();
  for (const c of bundlesPresent()) {
    if (c === CASE) continue;
    const fj = path.join(PUBLIC, dataRel(c), 'files.json');
    if (!fs.existsSync(fj)) continue;
    for (const v of Object.values(JSON.parse(fs.readFileSync(fj, 'utf8')))) if (v && v.path) servedElsewhere.add(v.path);
  }
  for (const f of fs.readdirSync(UPLOADS)) if (f.endsWith('.pdf') && mine.has(f) && !served.has(f) && !servedElsewhere.has(`${UPLOADS_URL}/${f}`)) { fs.rmSync(path.join(UPLOADS, f)); pruned++; }
  console.log(`files: ${copied} copied, ${kept} already in place, ${refused} refused, ${pruned} pruned${extracts ? `; ${extracts} extract(s) from the bundle, ${(extractBytes / 1048576).toFixed(1)} MiB` : ''}`);
  if (refused) fail(`${refused} served document(s) could not be gated — nothing is served that is not the registry's`);

  // A LINK TABLE IS THE DOCUMENT'S OWN CONTENT (its citations, each with the document's words at the pin), so a table is served
  // only for a document SERVED on this host: a document the registry or the host policy holds or links serves no table, its id
  // leaves docs.links so the window never asks for it, and the stamp names the withheld ids (the owner's word of 2026-10-10
  // 11:03 CDT: Kirchner I's appeal group off kirchner.ink — documents, files and tables; agreed by name 55339aa7 ⇄ f28bb754).
  const servedIds = new Set(decided.filter(({ pub }) => SERVED(pub.mode)).map(({ d }) => d.id));
  const tablesWithheld = Object.keys(tables).filter((id) => !servedIds.has(id)).sort();
  // has_links on the served row: the export's word per row (the Studio's docs answer since d2b39b36), else the counts map an
  // older export carries; masked to the tables this host serves
  const hasLinksHere = (d) => servedIds.has(d.id) && (d.has_links !== undefined && d.has_links !== null ? !!d.has_links : (docs.links || {})[d.id] != null);
  const maskedLinks = decided.filter(({ d }) => (d.has_links || (docs.links || {})[d.id] != null) && !hasLinksHere(d)).length;

  // docs.json — the window's /docs answer (case_root is the tree's localStorage key on the client: the case slug, not a path)
  const outDocs = {
    case_root: CASE, lane: '_admin/case_review',
    registry: { case: docs.registry && docs.registry.case, version: docs.registry && docs.registry.version, built: docs.registry && docs.registry.built,
      // the window's defaults ride the registry object by name: nav.hide_before (the hide-before threshold; "nothing hidden until
      // set" when absent — the viewer's rule of 2026-10-09; a per-case number, never the window's)
      nav: docs.registry && docs.registry.nav },
    docs: decided.map(({ d, pub }) => publicDoc(d, pub, pub.mode === 'pages' ? extractOf(d) : null, hasLinksHere(d))),
    links: Object.fromEntries(Object.entries(docs.links || {}).filter(([id]) => servedIds.has(id))),
  };
  fs.writeFileSync(path.join(DATA, 'docs.json'), JSON.stringify(outDocs));
  console.log(`has_links: ${outDocs.docs.filter((d) => d.has_links).length} row(s) say a table is served here${maskedLinks ? `; ${maskedLinks} with a table in the lane read false — not served on this host` : ''}`);

  // links/<id>.json — the window's /links answer per table
  let rows = 0, droppedAnswers = 0;
  const written = new Set();
  for (const [id, t] of Object.entries(tables)) {
    if (!servedIds.has(id)) continue;   // the document is not served here: its table is not served either
    const { table, dropped } = publicTable(t);
    rows += table.rows.length; droppedAnswers += dropped;
    fs.writeFileSync(path.join(LINKS, `${id}.json`), JSON.stringify(table));
    written.add(`${id}.json`);
  }
  for (const f of fs.readdirSync(LINKS)) if (f.endsWith('.json') && !written.has(f)) fs.rmSync(path.join(LINKS, f));
  console.log(`tables: ${written.size} written, ${rows} rows; ${droppedAnswers} coverage answer(s) left out for carrying a seat id${tablesWithheld.length ? `; ${tablesWithheld.length} withheld with the document(s) not served here: ${tablesWithheld.join(', ')}` : ''}`);

  // files.json — the manifest (studio-spec R1's shape): id → the served path, sha, bytes, pages, mode
  const manifest = {};
  for (const { d, pub } of decided) {
    const name = hostName(d);
    const x = pub.mode === 'pages' ? extractOf(d) : null;
    const onDisk = SERVED(pub.mode) && fs.existsSync(path.join(UPLOADS, name)) ? fs.statSync(path.join(UPLOADS, name)).size : null;
    // an extract's entry as the export names it: extract true, its own sha, extract_of {the whole file's sha, source_pages, leaves}
    manifest[d.id] = { path: SERVED(pub.mode) ? `${UPLOADS_URL}/${name}` : null, sha256: x ? x.sha256 : d.sha256, bytes: onDisk, pages: d.pages, publish: pub.mode, ...(pub.url ? { url: pub.url } : {}),
      ...(x ? { extract: true, extract_of: { sha256: x.extract_of.sha256, source_pages: x.extract_of.source_pages, leaves: x.extract_of.leaves } } : {}) };
  }
  fs.writeFileSync(path.join(DATA, 'files.json'), JSON.stringify(manifest));

  // the default document the page opens: the newest Filings main with a link table that is served (the owner may name another)
  const docket = (lbl) => { const m = /^ECF\s+(\d+)$/.exec(String(lbl || '').trim()); return m ? +m[1] : null; };
  const candidates = decided.filter(({ d, pub }) => pub.mode === 'serve' && d.group === 'Filings' && !d.parent && docket(d.label) != null && (docs.links || {})[d.id] && docs.links[d.id].rows > 0)
    .sort((a, b) => docket(b.d.label) - docket(a.d.label));
  const defaultDoc = candidates.length ? candidates[0].d.id : null;

  // _IMPORT.json — the stamp
  let studioCommit = null;
  try { studioCommit = fs.readFileSync(path.join(PUBLIC, 'casereview', 'vendor', 'VENDOR.json'), 'utf8').match(/"commit":\s*"([0-9a-f]+)"/)[1]; } catch {}
  const stamp = {
    case: CASE, imported: new Date().toISOString(), source: src.kind, export_stamp: src.stamp ? withoutDevicePaths(src.stamp) : null,
    registry_version: outDocs.registry.version, documents: docs.docs.length, tables: written.size, rows,
    publication: byMode,
    // the pages word's trace (the review-mode standard § 2c): the extracts this host serves, their bytes, the export's host bound
    extracts: { count: extracts, bytes: extractBytes, ids: pagesRows.map(({ d }) => d.id) },
    serve_max_mb: src.stamp && src.stamp.serve_max_mb !== undefined ? src.stamp.serve_max_mb : null,
    dev_override: DEV ? `${overridden} Filings rows treated as serve without a publish field` : false,
    default_doc: defaultDoc, vendored_studio_commit: studioCommit,
    host_policy: SERVE_GROUPS ? { serve_groups: [...SERVE_GROUPS], held_groups: heldGroups, not_hosted_here: hostHeld } : null,
    tables_withheld: tablesWithheld,   // the documents not served here whose tables are therefore not served either
  };
  fs.writeFileSync(path.join(DATA, '_IMPORT.json'), JSON.stringify(stamp, null, 2) + '\n');

  // the rewrites: Netlify's _redirects (the publish dir) and the local static server's serve.json (serve-handler)
  // written as a MARKED BLOCK: a host whose public/_redirects carries other generated rules (lawsofexistence.com's
  // legacy 301 freeze) keeps them — the block is replaced in place when present, appended when not
  // a second case's block carries the case name in both markers (`# casereview BEGIN <slug> — …` / `# casereview END <slug>`),
  // so two blocks coexist and each is regenerated alone; a keyed rule is `from  root=<slug>  to  200` (Netlify's query
  // condition), and a NEW keyed block is inserted BEFORE the default block when one exists (first match wins; a bare
  // rule matches under any query)
  const BEGIN = `# casereview BEGIN ${KEYED ? `${CASE} ` : ''}— generated by scripts/import-casereview.mjs: the Studio\'s Case Review API routes, served static; do not hand-edit this block`;
  const END = `# casereview END${KEYED ? ` ${CASE}` : ''}`;
  const DEFAULT_BEGIN = '# casereview BEGIN — generated by scripts/import-casereview.mjs';
  const q = ROOT_QS ? `  ${ROOT_QS}` : '';
  const soleKeyedBlock = KEYED && !fs.existsSync(path.join(PUBLIC, dataRel(DEFAULT_CASE), '_IMPORT.json'));
  const redirects = [
    BEGIN,
    // the host table where the Studio serves its lane list: bare (any query) in the default block, or in the sole keyed block
    ...(!KEYED || soleKeyedBlock ? [CASES_RULE] : []),
    `/api/casereview/docs${q}  ${DATA_URL}/docs.json  200`,
    `/api/casereview/links/:id${q}  ${DATA_URL}/links/:id.json  200`,
    // a served document whose file is not <id>.pdf (an unsafe id, or the docket-slug layout): the request path as the
    // window sends it (encodeURIComponent) and, when it differs, the form a browser normalises to (encodeURI)
    ...decided.filter(x => SERVED(x.pub.mode) && needsRule(x.d)).flatMap(({ d }) => {
      const a = encodeURIComponent(d.id), b = encodeURI(d.id);
      return [...new Set([a, b])].map(enc => `/api/casereview/file/${enc}${q}  ${UPLOADS_URL}/${hostName(d)}  200`);
    }),
    `/api/casereview/file/:id${q}  ${UPLOADS_URL}/:id.pdf  200`,
    END,
  ].join('\n');
  const redirectsPath = path.join(PUBLIC, '_redirects');
  let prior = fs.existsSync(redirectsPath) ? fs.readFileSync(redirectsPath, 'utf8') : '';
  // a file this importer wrote before the markers existed (kirchnervjohnson's first form, one unmarked header line) is
  // the block itself, not a host's other rules — replaced whole, never kept beside the new block
  if (/^# generated by scripts\/import-casereview\.mjs/.test(prior.trimStart())) prior = '';
  // END is searched from this block's own BEGIN: the default END is a prefix of every keyed END
  const i0 = prior.indexOf(BEGIN), i1 = i0 >= 0 ? prior.indexOf(END, i0) : -1;
  const iDefault = KEYED ? prior.indexOf(DEFAULT_BEGIN) : -1;
  const merged = i0 >= 0 && i1 > i0
    ? prior.slice(0, i0) + redirects + prior.slice(i1 + END.length)
    : iDefault >= 0
      ? prior.slice(0, iDefault) + redirects + '\n\n' + prior.slice(iDefault)
      : (prior.trimEnd() ? `${prior.trimEnd()}\n\n` : '') + redirects + '\n';
  fs.writeFileSync(redirectsPath, merged);
  // serve.json (serve-handler, the local static server) has no query condition in its rewrite grammar — a second case is
  // not servable there; its rules are the default case's alone, left untouched by a keyed import. `next start` serves both
  // through next.config.ts's rewrites (has: query root=<slug>), kvj's `serve out` the default case.
  // EXCEPT a host whose ONLY bundle is a keyed case (kirchner.ink: the MN case rides the keyed layout, no default bundle exists):
  // the sole case's routes are written BARE into serve.json so the static pane and `serve out` serve it; _redirects stays keyed
  // (the host sets projroot, the window sends root on every fetch). Agreed by name 55339aa7 ⇄ f28bb754, 2026-10-10.
  const soleKeyed = KEYED && !fs.existsSync(path.join(PUBLIC, dataRel(DEFAULT_CASE), '_IMPORT.json'));
  const serveJson = (KEYED && !soleKeyed) ? null : {
    cleanUrls: true, trailingSlash: false,
    rewrites: [
      { source: '/api/casereview/cases', destination: '/casereview/hosts.json' },
      { source: '/api/casereview/docs', destination: `${DATA_URL}/docs.json` },
      { source: '/api/casereview/links/:id', destination: `${DATA_URL}/links/:id.json` },
      // serve-handler matches the DECODED path against a path-to-regexp source; no parameter, so nothing is re-encoded
      ...decided.filter(x => SERVED(x.pub.mode) && needsRule(x.d)).map(({ d }) => ({ source: `/api/casereview/file/${p2r(d.id)}`, destination: `${UPLOADS_URL}/${hostName(d)}` })),
      { source: '/api/casereview/file/:id', destination: `${UPLOADS_URL}/:id.pdf` },
    ],
    headers: [
      { source: '**/*.json', headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }] },
      { source: '**/*.pdf', headers: [{ key: 'Content-Type', value: 'application/pdf' }] },
      { source: '**/*.mjs', headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }] },
    ],
  };
  if (serveJson) fs.writeFileSync(path.join(PUBLIC, 'serve.json'), JSON.stringify(serveJson, null, 2) + '\n');
  // THE HOST TABLE: the registry half of this lane's row, the site's words kept; the /cases rewrite beside the three routes
  const host = upsertHost({
    name: CASE, case_root: CASE, case: outDocs.registry.case ?? null, version: outDocs.registry.version ?? null, built: outDocs.registry.built ?? null,
    current: !KEYED, root: KEYED ? CASE : null,
    imported: { at: stamp.imported, documents: stamp.documents, tables: stamp.tables, rows: stamp.rows, publication: stamp.publication,
                extracts: { count: stamp.extracts.count, bytes: stamp.extracts.bytes }, vendored_studio_commit: studioCommit },
  });
  const ruleTouched = ensureCasesRule();
  console.log(`hosts.json: ${host.created ? 'row added for' : 'row updated for'} ${CASE} (route ${host.row.route}, kind ${host.row.kind}${host.row.composition ? `, composition ${host.row.composition}` : ', lane page'})${ruleTouched.length ? `; /cases rewrite added to ${ruleTouched.join(' + ')}` : ''}`);
  console.log(`bundle written to public/${DATA_REL} (default document ${defaultDoc || 'none — nothing served'}); rewrites in public/_redirects${KEYED ? ` (keyed on ?${ROOT_QS}; serve.json ${soleKeyed ? 'bare (the host\'s only case)' : 'untouched'})` : ' and public/serve.json'}`);
  if (DEV) console.warn('REMINDER: this bundle carries the development override — rerun without --dev-serve-filings before committing it');
}

if (CHECK) check(); else if (HOSTS) refreshHosts(); else await run();
