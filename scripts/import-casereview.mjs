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
//   node scripts/import-casereview.mjs --from <export_dir>    # from the checker's export (studio-spec R1) once it lands
//   node scripts/import-casereview.mjs --check                # the bundle on disk is whole (runs in every build)
//   node scripts/import-casereview.mjs --out <dir>            # write the bundle under <dir> instead of public/ (a dry run)
//   node scripts/import-casereview.mjs --case <slug> …        # a SECOND case on the same host (2026-10-10, the MN lane): its bundle under
//                                                             # public/casereview/<slug>/data/, its API rules keyed on the window's ?root=<slug>
//   --uploads-dir <dir under public/> --names id|docket --name-map <json>   # a host's own PDF layout (lawsofexistence.com)
//   --serve-groups Filings[,…]                                 # a HOST policy: registry serve rows of other groups are not hosted here (link if a url, else hold), stamped
//   node scripts/import-casereview.mjs --dev-serve-filings    # DEVELOPMENT ONLY — see PUBLICATION below
//
// PUBLICATION (studio-spec fbf555d9's R3, 2026-10-01; the owner's content gates of 2026-09-30): a per-row `publish`
// field in docs.json — serve | link | hold, with publish_url for link — decides what the site carries. FAIL CLOSED on
// every kind, the filings included: a row without the field is `hold`. The Studio ignores the field; the export (and,
// until it lands, this importer) applies it: link → path null + url, hold → path null, the row KEPT and marked so a
// citation to it still says what it points at. The admins write the field; the owner decides the case law and the
// hosting size. `--dev-serve-filings` treats the Filings group as `serve` for a LOCAL proof of the module and is
// refused under CI/NETLIFY; a bundle it wrote is stamped and `--check` refuses to deploy it.
//
// What the bundle does not carry (the author's voice everywhere the reader reads; record and links only): the lane's
// seat fields (`by`), the drafters' and admins' working notes (`note`, meta.notes, the registry's note_v0_* keys), the
// checker's passage texts (the window boxes passages from the PDF's own text layer — the field is 60 % of the bytes
// and read by nothing on the client), filesystem paths, mirror paths, shelf aliases. The checker's structured answers
// (violations, warnings, coverage, stale_render, k, unit_id, pdf pages, section-map resolutions) ride unchanged.
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
const MODES = new Set(['serve', 'link', 'hold']);
// HOST POLICY (lawsofexistence.com, 2026-10-01): `--serve-groups Filings[,Rules…]` — the registry's `serve` is the lane's
// word on what MAY be published; which groups a HOST actually hosts is the owner's hosting decision per site (the
// non-filing serve set is 537 documents, 735 MB). A serve row outside the listed groups is not hosted here: `link` when
// the registry names an http(s) publish_url, else `hold` — the row kept and the window says "not published on this
// site yet" (core.publishedAway). Without the flag every serve row is hosted, as before. Stamped in _IMPORT.json.
const SERVE_GROUPS = (() => { const v = opt('--serve-groups', null); return v ? new Set(v.split(',').map(x => x.trim()).filter(Boolean)) : null; })();
function publishOf(doc) {
  const p = doc.publish;
  if (p === 'serve' && SERVE_GROUPS && !SERVE_GROUPS.has(doc.group)) {
    const url = /^https?:\/\//.test(String(doc.publish_url || '')) ? doc.publish_url : null;
    return { mode: url ? 'link' : 'hold', url, by: 'host policy — the group is not hosted on this site' };
  }
  if (MODES.has(p)) return { mode: p, url: p === 'link' ? (doc.publish_url || null) : null, by: 'the registry' };
  if (DEV && doc.group === 'Filings') return { mode: 'serve', url: null, by: 'DEV OVERRIDE' };
  return { mode: 'hold', url: null, by: p == null ? 'no publish field — fail closed' : `publish ${JSON.stringify(p)} is not serve|link|hold — fail closed` };
}
const FILER_COPY = /^none \(owner as-filed copy/;

// ---------------------------------------------------------------- the public shapes
const DOC_KEEP = ['id', 'label', 'title', 'kind', 'parent', 'ecf_no', 'attachment', 'filed', 'filer', 'pages', 'sha256', 'offset', 'pagemap', 'text_layer', 'group', 'inventory_page', 'ligature_drop', 'ligature_drop_density', 'pagemap_basis',
  'embed', 'duration']   // the video row (studio-spec 2026-10-09 § 5.5): the embed {provider, id} and the recording's seconds;
function publicDoc(d, pub) {
  const o = {};
  for (const k of DOC_KEEP) if (d[k] !== undefined) o[k] = d[k];
  if (d.pagemap_error) o.pagemap = null;   // the loader could not read the map: the window falls to the offset, as the Studio does
  if (FILER_COPY.test(String(d.stamp || ''))) { o.filer_copy = true; o.title = `${o.title || ''} · filer's copy, not the court's stamped copy`.trim(); }
  o.publish = pub.mode;
  if (pub.mode === 'link') o.publish_url = pub.url;
  o.path = pub.mode === 'serve' ? `${UPLOADS_URL}/${hostName(d)}` : null;
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
function fromExport(dir) {
  const docs = JSON.parse(fs.readFileSync(path.join(dir, 'docs.json'), 'utf8'));
  const tables = {};
  for (const f of fs.readdirSync(path.join(dir, 'links'))) if (f.endsWith('.json')) tables[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, 'links', f), 'utf8'));
  let stamp = null; try { stamp = JSON.parse(fs.readFileSync(path.join(dir, '_EXPORT.json'), 'utf8')); } catch {}
  let files = null; try { files = JSON.parse(fs.readFileSync(path.join(dir, 'files.json'), 'utf8')); } catch {}
  return { docs, tables, caseRoot: CASE_ROOT_OPT || (stamp && stamp.case_root) || docs.case_root, kind: `the checker's export at ${dir}`, stamp, files };
}

// ---------------------------------------------------------------- the check (every build)
// `--check` reads the bundle of `--case`; without `--case` it reads the default bundle AND every other case's bundle present
// under public/casereview/<slug>/data/, so the build gate covers a second case the day it lands with no script change.
// A host whose only case is a keyed one (kirchner.ink: the MN case) has no default bundle, so without `--case` the default
// is read when its stamp is present and the check fails only when no bundle of ANY case exists (agreed by name 55339aa7 ⇄
// f28bb754, 2026-10-10); `--check --case <slug>` reads that one bundle and requires it.
function check() {
  if (argv.includes('--case')) { checkOne(CASE); return; }
  const present = bundlesPresent();
  if (!present.length) fail(`no bundle: public/${dataRel(DEFAULT_CASE)}/_IMPORT.json is missing and no public/casereview/<slug>/data/_IMPORT.json is present — run the importer`);
  for (const c of present) checkOne(c);
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
  if (imp.dev_override) {
    const line = `the bundle was written under --dev-serve-filings (${imp.imported}) — a development proof, not the registry's word`;
    if (deploying) { console.error(`  REFUSED  ${line}`); bad++; } else console.warn(`  WARNING  ${line}; rerun the importer without the flag before committing the bundle`);
  }
  const docs = JSON.parse(fs.readFileSync(path.join(DATA, 'docs.json'), 'utf8'));
  let served = 0, missing = 0, wrong = 0;
  for (const d of docs.docs) {
    if (d.publish !== 'serve') continue;
    served++;
    const f = path.join(PUBLIC, d.path.replace(/^\//, ''));
    if (!fs.existsSync(f)) { missing++; if (missing <= 5) console.error(`  missing  ${d.path} (${d.id} is published as serve)`); continue; }
    if (sha256(fs.readFileSync(f)) !== d.sha256) { wrong++; console.error(`  SHA      ${d.path} is not the registry's ${d.id} (${d.sha256.slice(0, 12)}…)`); }
  }
  if (missing) console.error(`  ${missing} served document(s) have no file under public/ — the hosting decision (the files are gitignored until the owner's word)`);
  bad += missing + wrong;
  for (const id of Object.keys(docs.links || {})) if (!fs.existsSync(path.join(LINKS, `${id}.json`))) { console.error(`  missing  links/${id}.json`); bad++; }
  for (const f of ['_redirects', 'serve.json']) if (!fs.existsSync(path.join(PUBLIC, f))) { console.error(`  missing  public/${f} (the API rewrites)`); bad++; }
  // the stamp names the vendored Studio commit it was imported under; a sync after the import leaves it stale — a warning, the bundle itself is unaffected
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'casereview', 'vendor', 'VENDOR.json'), 'utf8'));
    if (imp.vendored_studio_commit && rec.source && rec.source.commit && imp.vendored_studio_commit !== rec.source.commit) console.warn(`  WARNING  the stamp was imported under Studio ${String(imp.vendored_studio_commit).slice(0, 8)}, the vendor record is at ${String(rec.source.commit).slice(0, 8)} — re-run the importer after a sync to re-stamp (the bundle's bytes do not depend on it)`);
  } catch { /* no record: the vendor check says so */ }
  if (imp.host_policy) console.log(`  host policy: only ${(imp.host_policy.serve_groups || []).join(', ')} hosted here — ${imp.host_policy.not_hosted_here} registry serve row(s) said, not fetched`);
  if (bad) fail(`${bad} problem(s) in the bundle${c === DEFAULT_CASE ? '' : ` of ${c}`}`);
  console.log(`bundle ok${c === DEFAULT_CASE ? '' : ` (${c})`}: ${docs.docs.length} documents (${served} served, ${docs.docs.filter(d => d.publish === 'link').length} linked, ${docs.docs.filter(d => d.publish === 'hold').length} held), ${Object.keys(docs.links || {}).length} link tables; imported ${imp.imported} from ${imp.source}`);
}

// ---------------------------------------------------------------- the import
async function run() {
  if (DEV && (process.env.NETLIFY || process.env.CI)) fail('--dev-serve-filings is a development flag; it is refused under CI/NETLIFY');
  const src = /^https?:\/\//.test(FROM) ? await fromApi(FROM) : fromExport(FROM);
  const { docs, tables } = src;
  const caseRoot = CASE_ROOT_OPT || src.caseRoot;
  if (!caseRoot || !fs.existsSync(caseRoot)) fail(`the case root is not on this machine: ${caseRoot} (pass --case-root)`);
  console.log(`source: ${src.kind}; case root ${caseRoot}; ${docs.docs.length} documents, ${Object.keys(tables).length} link tables`);

  // the registry's word per row
  const decided = docs.docs.map(d => ({ d, pub: publishOf(d) }));
  const byMode = { serve: 0, link: 0, hold: 0 };
  for (const x of decided) byMode[x.pub.mode]++;
  const overridden = decided.filter(x => x.pub.by === 'DEV OVERRIDE').length;
  const byRegistry = decided.filter(x => x.pub.by === 'the registry').length;
  const byHost = decided.filter(x => x.pub.by.startsWith('host policy')).length;
  console.log(`policy: ${byRegistry + byHost} rows carry the registry's publish field, ${decided.length - byRegistry - byHost} without one${DEV ? '' : ' (held)'}`);
  if (DEV) console.warn(`DEVELOPMENT OVERRIDE: ${overridden} Filings rows without a publish field treated as serve — not the registry's word`);
  const hostHeld = byHost;
  if (SERVE_GROUPS) console.log(`host policy: only ${[...SERVE_GROUPS].join(', ')} hosted here — ${hostHeld} serve row(s) of other groups said, not fetched`);
  console.log(`publication: serve ${byMode.serve} · link ${byMode.link} · hold ${byMode.hold}`);

  fs.mkdirSync(LINKS, { recursive: true });
  fs.mkdirSync(UPLOADS, { recursive: true });

  // the served PDFs, sha-gated against the registry (the render binding: a file that is not the registry's is not served)
  let copied = 0, kept = 0, refused = 0;
  const served = new Set();
  for (const { d, pub } of decided) {
    if (pub.mode !== 'serve') continue;
    if (!d.path) { console.error(`  no path  ${d.id} is serve but the registry has no path`); refused++; continue; }
    const from = path.resolve(caseRoot, d.path);
    const name = hostName(d);
    const to = path.join(UPLOADS, name);
    if (!fs.existsSync(from)) { console.error(`  absent   ${d.id}: ${from}`); refused++; continue; }
    if (fs.existsSync(to) && sha256(fs.readFileSync(to)) === d.sha256) { kept++; served.add(name); continue; }
    const buf = fs.readFileSync(from);
    const h = sha256(buf);
    if (h !== d.sha256) { console.error(`  SHA      ${d.id}: the file on disk is ${h.slice(0, 12)}…, the registry says ${String(d.sha256).slice(0, 12)}… — not served`); refused++; continue; }
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
  console.log(`files: ${copied} copied, ${kept} already in place, ${refused} refused, ${pruned} pruned`);
  if (refused) fail(`${refused} served document(s) could not be gated — nothing is served that is not the registry's`);

  // docs.json — the window's /docs answer (case_root is the tree's localStorage key on the client: the case slug, not a path)
  const outDocs = {
    case_root: CASE, lane: '_admin/case_review',
    registry: { case: docs.registry && docs.registry.case, version: docs.registry && docs.registry.version, built: docs.registry && docs.registry.built,
      // the window's defaults ride the registry object by name: nav.hide_before (the hide-before threshold; "nothing hidden until
      // set" when absent — the viewer's rule of 2026-10-09; a per-case number, never the window's)
      nav: docs.registry && docs.registry.nav },
    docs: decided.map(({ d, pub }) => publicDoc(d, pub)),
    links: docs.links || {},
  };
  fs.writeFileSync(path.join(DATA, 'docs.json'), JSON.stringify(outDocs));

  // links/<id>.json — the window's /links answer per table
  let rows = 0, droppedAnswers = 0;
  const written = new Set();
  for (const [id, t] of Object.entries(tables)) {
    const { table, dropped } = publicTable(t);
    rows += table.rows.length; droppedAnswers += dropped;
    fs.writeFileSync(path.join(LINKS, `${id}.json`), JSON.stringify(table));
    written.add(`${id}.json`);
  }
  for (const f of fs.readdirSync(LINKS)) if (f.endsWith('.json') && !written.has(f)) fs.rmSync(path.join(LINKS, f));
  console.log(`tables: ${written.size} written, ${rows} rows; ${droppedAnswers} coverage answer(s) left out for carrying a seat id`);

  // files.json — the manifest (studio-spec R1's shape): id → the served path, sha, bytes, pages, mode
  const manifest = {};
  for (const { d, pub } of decided) {
    const name = hostName(d);
    manifest[d.id] = { path: pub.mode === 'serve' ? `${UPLOADS_URL}/${name}` : null, sha256: d.sha256, bytes: pub.mode === 'serve' && fs.existsSync(path.join(UPLOADS, name)) ? fs.statSync(path.join(UPLOADS, name)).size : null, pages: d.pages, publish: pub.mode, ...(pub.url ? { url: pub.url } : {}) };
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
    case: CASE, imported: new Date().toISOString(), source: src.kind, export_stamp: src.stamp || null,
    registry_version: outDocs.registry.version, documents: docs.docs.length, tables: written.size, rows,
    publication: byMode, dev_override: DEV ? `${overridden} Filings rows treated as serve without a publish field` : false,
    default_doc: defaultDoc, vendored_studio_commit: studioCommit,
    host_policy: SERVE_GROUPS ? { serve_groups: [...SERVE_GROUPS], not_hosted_here: hostHeld } : null,
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
  const redirects = [
    BEGIN,
    `/api/casereview/docs${q}  ${DATA_URL}/docs.json  200`,
    `/api/casereview/links/:id${q}  ${DATA_URL}/links/:id.json  200`,
    // a served document whose file is not <id>.pdf (an unsafe id, or the docket-slug layout): the request path as the
    // window sends it (encodeURIComponent) and, when it differs, the form a browser normalises to (encodeURI)
    ...decided.filter(x => x.pub.mode === 'serve' && needsRule(x.d)).flatMap(({ d }) => {
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
      { source: '/api/casereview/docs', destination: `${DATA_URL}/docs.json` },
      { source: '/api/casereview/links/:id', destination: `${DATA_URL}/links/:id.json` },
      // serve-handler matches the DECODED path against a path-to-regexp source; no parameter, so nothing is re-encoded
      ...decided.filter(x => x.pub.mode === 'serve' && needsRule(x.d)).map(({ d }) => ({ source: `/api/casereview/file/${p2r(d.id)}`, destination: `${UPLOADS_URL}/${hostName(d)}` })),
      { source: '/api/casereview/file/:id', destination: `${UPLOADS_URL}/:id.pdf` },
    ],
    headers: [
      { source: '**/*.json', headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }] },
      { source: '**/*.pdf', headers: [{ key: 'Content-Type', value: 'application/pdf' }] },
      { source: '**/*.mjs', headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }] },
    ],
  };
  if (serveJson) fs.writeFileSync(path.join(PUBLIC, 'serve.json'), JSON.stringify(serveJson, null, 2) + '\n');
  console.log(`bundle written to public/${DATA_REL} (default document ${defaultDoc || 'none — nothing served'}); rewrites in public/_redirects${KEYED ? ` (keyed on ?${ROOT_QS}; serve.json ${soleKeyed ? 'bare (the host\'s only case)' : 'untouched'})` : ' and public/serve.json'}`);
  if (DEV) console.warn('REMINDER: this bundle carries the development override — rerun without --dev-serve-filings before committing it');
}

if (CHECK) check(); else await run();
