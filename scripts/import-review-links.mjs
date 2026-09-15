#!/usr/bin/env node
// scripts/import-review-links.mjs — the REVIEW MODE feed for a book published
// from the owner's research library (owner 2026-09-14: "create a dual viewer
// like we do for the STAC/HLS images … lay links over the citations that bring
// up the pinned page in the other viewer of the primary source cited in the
// book so that people can review and check the work easily in one place").
//
//   node scripts/import-review-links.mjs            # every book in REVIEWS
//   node scripts/import-review-links.mjs <slug>     # one book
//
// For each book it reads the drafter's join (the research library's
// "Pinned Citation Extracts" lane: _INDEX.tsv, _SOURCES.tsv, and the sha256
// list; or `_WEB/links.json` when the data seat has emitted it) and
//
//   1. writes content/works/<slug>.md — the book with its working header
//      stripped, its leading H1 removed (the reader shows the title from
//      works.json), the `[^^id]` endnotes made standard `[^id]` footnotes, and
//      every citation UNIT in a note wrapped as a markdown link
//      `[unit text](cite:<note>/<seq>)`; the site's Markdown renderer turns a
//      `cite:` href into the review-pane control (data-cite);
//   2. copies the PUBLIC-DOMAIN extracts (one PDF per cited page) to
//      public/uploads/research/<id>/sources/<KEY>/<file>, checking each sha256
//      against the lane's fixity list — nothing in copyright or licence-bound
//      leaves the library (admin constraint 4, 2026-09-12);
//   3. writes content/review/<slug>.json — the units in book order with their
//      pages, source titles, rights and verified flags; units the lane could
//      not cut, or could cut but must not publish, are carried with their
//      status so the page shows the citation MARKED, never silently dropped.
//
// The book file itself and the lane are never written. Idempotent: existing
// copies whose sha256 matches are kept. Not part of the build (the source tree
// is not on the build host); run it, review `git diff`, commit.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

// The served copy of a MULTI-PAGE file is linearized (qpdf) so pdf.js can paint the first page from
// the first byte-range instead of downloading the whole file; content and page count are unchanged,
// bytes and sha differ from the lane's. `_SERVED.json` beside the files maps lane sha → served sha so a
// re-run copies only what moved. Single-page extracts (the audit copies) stay byte-identical.
function linearizeInto(src, dst, laneSha, served) {
  const key = dst.split('/uploads/')[1];
  const rec = served[key];
  if (rec && rec.source === laneSha && existsSync(dst) && sha256(dst) === rec.served) return rec.served;
  mkdirSync(dirname(dst), { recursive: true });
  try {
    execFileSync('qpdf', ['--linearize', '--object-streams=generate', src, dst], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    // qpdf exits 3 on warnings with the output written; anything else is a real failure
    if (!(e.status === 3 && existsSync(dst))) throw new Error(`qpdf failed on ${basename(src)}: ${e.stderr?.toString().slice(0, 200) || e.message}`);
  }
  const got = sha256(dst);
  served[key] = { source: laneSha, served: got };
  return got;
}

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const LIB = join(homedir(), 'Git', 'work_station', 'research_library');
const BOOK_DIR = join(LIB, '2_Academic Articles', '11_Immunity and Standing Doctrine Geneology', 'BOOK');

/** one entry per reviewed book; `slug` must already be a `local` work in content/works.json (scripts/import-local-works.mjs) */
const REVIEWS = [
  {
    slug: 'the-subjects-unanswered-plea',
    id: 'immunity-book', // public/uploads/research/<id>/
    book: join(BOOK_DIR, 'A_RESTORATIVE_AND_COMPARATIVE_HISTORY_OF_SOVEREIGN_ABSOLUTE_AND_QUALIFIED_IMMUNITY.md'),
    lane: join(BOOK_DIR, 'Pinned Citation Extracts'),
  },
  {
    slug: 'the-holy-seed',
    id: 'holy-seed',
    book: join(LIB, '2_Academic Articles', '13_Fall of Babylon and Jewish Identity', 'BOOK', 'THE_HOLY_SEED.md'),
    lane: join(LIB, '2_Academic Articles', '13_Fall of Babylon and Jewish Identity', 'BOOK', 'Pinned Citation Extracts'),
  },
];

const PUBLISHABLE = new Set(['public-domain']);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
// PLAIN TSV (the data seat's contract, 2026-09-14): split on tabs only — no
// quoting, no field carries a tab or newline; five units open with a quote mark
// and a csv-style reader would swallow them
const tsv = (file) => {
  const [head, ...rows] = readFileSync(file, 'utf8').split('\n').filter((l) => l.length);
  const cols = head.split('\t');
  return rows.map((r) => {
    const cells = r.split('\t');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
};

/** printed-page label from the pin kind and the extract's suffix letter */
const pinLabel = (kind, pin, file, status, sourceKey) => {
  const suf = file ? /_([a-z])[^_/]*\.pdf$/.exec(file)?.[1] : null;
  if (sourceKey === 'POLLARD_1911') return `1611 facsimile p. ${pin}`; // the reprint's PDF page: the 1611 is unpaginated
  // owner rule 2026-09-15: a case cited by its first page means the WHOLE case — the lane cuts every page of
  // the case (CUT_CASE rows follow the CUT_FIRST row); the first page is labelled as the case's beginning
  if (status === 'CUT_FIRST') return pin ? `case begins, p. ${pin}` : 'case begins';
  if (kind === 'col') return `col. ${pin}`;
  if (kind === 'folio' || suf === 'f') return `f. ${pin}`;
  if (kind === 'memb' || suf === 'm') return `m. ${pin.replace(/^0+/, '')}`;
  if (kind === 'sig' || suf === 's') return `sig. ${pin}`;
  return pin ? `p. ${pin}` : '';
};

const escapeLinkText = (t) => t.replace(/([[\]])/g, '\\$1');

function stripHeader(md) {
  // the working header is one HTML comment before the title; the academic
  // converter drops it the same way
  let s = md.replace(/^﻿/, '');
  if (s.startsWith('<!--')) {
    // the comment closes on a line of its own; an inline '-->' in the header text is not the close
    const m = /^-->[ \t]*$/m.exec(s);
    if (m) s = s.slice(m.index + m[0].length);
  }
  s = s.replace(/^\s+/, '');
  const lines = s.split('\n');
  if (/^#\s/.test(lines[0] ?? '')) lines.shift();
  return lines.join('\n').replace(/^\s+/, '');
}

function loadFeed(lane) {
  const web = join(lane, '_WEB', 'links.json');
  if (existsSync(web)) {
    // the data seat's manifest (agreed 2026-09-14): units carry the source title
    const j = JSON.parse(readFileSync(web, 'utf8'));
    const sources = Object.fromEntries((j.sources ?? []).map((s) => [s.key, s]));
    const rows = j.units.map((u) => ({
      note: u.note, kind: u.kind ?? 'fn', seq: String(u.seq), line: String(u.line ?? ''), cls: u.cls ?? '',
      source_key: u.sourceKey ?? '', pin: u.pin ?? '', verified: u.verified ? 'Y' : 'N', extract: u.file ?? '',
      status: u.status ?? (u.file ? 'CUT' : 'NO_SOURCE'), rights: u.rights ?? sources[u.sourceKey]?.rights ?? '', text: u.unitText,
      sha256: u.sha256 ?? '',
    }));
    return { feed: `_WEB/links.json (${j.generated ?? 'undated'})`, rows, sources, bookSha: j.bookSha ?? null, bookMeta: {} };
  }
  const rows = tsv(join(lane, '_INDEX.tsv'));
  const sources = Object.fromEntries(tsv(join(lane, '_SOURCES.tsv')).map((s) => [s.key, s]));
  // _BOOK.json names the book the rows were parsed from (path, bytes, sha256, git blob)
  const bookJson = join(lane, '_BOOK.json');
  const bookMeta = existsSync(bookJson) ? JSON.parse(readFileSync(bookJson, 'utf8')) : {};
  const bookSha = bookMeta.sha256 ?? null;
  const fixity = {};
  if (existsSync(join(lane, '_FIXITY_SHA256.txt'))) {
    for (const l of readFileSync(join(lane, '_FIXITY_SHA256.txt'), 'utf8').split('\n')) {
      const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l.trim());
      if (m) fixity[m[2]] = m[1];
    }
  }
  // the reading copies (owner rule 2026-09-15): `context` = a multi-page PDF under _CONTEXT/, `context_page` = the
  // cited page's 1-based position inside it; fixity in _CONTEXT/_FIXITY_SHA256.txt
  if (existsSync(join(lane, '_CONTEXT', '_FIXITY_SHA256.txt'))) {
    for (const l of readFileSync(join(lane, '_CONTEXT', '_FIXITY_SHA256.txt'), 'utf8').split('\n')) {
      const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l.trim());
      if (m) fixity[m[2]] = m[1];
    }
  }
  for (const r of rows) { r.sha256 = fixity[r.extract] ?? ''; r.context_sha = r.context ? (fixity[r.context] ?? '') : ''; }
  return { feed: `_INDEX.tsv + _SOURCES.tsv${bookSha ? ' (_BOOK.json ' + bookSha.slice(0, 8) + ')' : ''}`, rows, sources, bookSha, bookMeta: { commit: bookMeta.git_head || bookMeta.commit || bookMeta.head || bookMeta.git_blob || null, parsed: bookMeta.parsed || bookMeta.generated || bookMeta.date || null } };
}

function importOne(cfg) {
  const t0 = Date.now();
  if (!existsSync(cfg.book)) throw new Error(`book missing: ${cfg.book}`);
  if (!existsSync(cfg.lane)) throw new Error(`lane missing: ${cfg.lane}`);
  const raw = readFileSync(cfg.book, 'utf8');
  const bookSha = createHash('sha256').update(raw).digest('hex');
  const { feed, rows, sources, bookSha: feedSha, bookMeta } = loadFeed(cfg.lane);
  if (feedSha && feedSha !== bookSha) {
    throw new Error(`the feed was built from another book: feed bookSha ${feedSha.slice(0, 12)} ≠ book ${bookSha.slice(0, 12)} — re-run the lane first`);
  }
  // every refusal happens HERE, before a byte is written: a lane caught mid-regeneration (index at one
  // book, overlay at another; a render missing or renamed) must leave the site's tree exactly as it was
  const overlayFile = join(cfg.lane, '_WEB', 'overlay.json');
  const overlay = existsSync(overlayFile) ? JSON.parse(readFileSync(overlayFile, 'utf8')) : null;
  if (overlay) {
    if (overlay.book?.sha256 && overlay.book.sha256 !== bookSha) throw new Error(`overlay.json was built from another book: ${overlay.book.sha256.slice(0, 12)} ≠ ${bookSha.slice(0, 12)} — the lane is mid-regeneration; nothing written`);
    const rsrc = join(cfg.lane, '_WEB', basename(overlay.pdf.path));
    if (!existsSync(rsrc)) throw new Error(`overlay.json names a render that is not in the lane: ${basename(overlay.pdf.path)}; nothing written`);
    if (sha256(rsrc) !== overlay.pdf.sha256) throw new Error(`the book render on disk is not the one overlay.json was built on; nothing written`);
  }
  for (const r of rows) {
    if (r.extract && (r.status === 'CUT' || r.status === 'CUT_FIRST' || r.status === 'CUT_CASE') && PUBLISHABLE.has(r.rights) && !existsSync(join(cfg.lane, r.extract))) throw new Error(`${r.extract} is named by the index but missing on disk — the lane is mid-write; nothing written`);
    if (r.context && PUBLISHABLE.has(r.rights) && !existsSync(join(cfg.lane, r.context))) throw new Error(`${r.context} is named by the index but missing on disk — the lane is mid-write; nothing written`);
  }

  // ---- 1. the book: header off, endnotes → footnotes, units wrapped -------
  let md = stripHeader(raw).replace(/\[\^\^([A-Za-z0-9_]+)\]/g, '[^$1]');
  const lines = md.split('\n');
  const defLine = new Map(); // note id → line index
  lines.forEach((l, i) => { const m = /^\[\^([A-Za-z0-9_]+)\]:/.exec(l); if (m) defLine.set(m[1], i); });

  // units: one per (note, seq); a unit cited across a range has several pages
  const units = new Map();
  for (const r of rows) {
    if (r.status === 'SKIP' || !r.text) continue;
    const key = `${r.note}/${r.seq}`;
    let u = units.get(key);
    if (!u) {
      u = { id: key, note: r.note, seq: Number(r.seq), line: Number(r.line) || 0, text: r.text, cls: r.cls, status: r.status, rights: r.rights || sources[r.source_key]?.rights || '', source: r.source_key || null, pages: [],
        start: r.unit_start === '' || r.unit_start == null ? null : Number(r.unit_start), end: r.unit_end === '' || r.unit_end == null ? null : Number(r.unit_end) };
      units.set(key, u);
    }
    if (r.extract && (r.status === 'CUT' || r.status === 'CUT_FIRST' || r.status === 'CUT_CASE')) {
      const kind = sources[r.source_key]?.pinkind || 'page';
      // verified: Y = the page number was read on the page · N = placed by the run's offset · '-' = a verso with nothing to read
      // rights and source are PER PAGE: a unit matched by several sources carries rows from each (a
      // scripture unit cut from the 1611 facsimile AND the Bodleian leaves), and only the page's own
      // rights decide whether it is published — the 2026-09-14 unit-level test let 8 licence-bound and
      // owner-use leaves onto the device branch
      u.pages.push({ pin: r.pin, label: pinLabel(kind, r.pin, r.extract, r.status, r.source_key), extract: r.extract, source: r.source_key, rights: r.rights || sources[r.source_key]?.rights || '',
        verified: r.verified === 'Y' ? true : r.verified === '-' ? null : false, sha256: r.sha256 || null, ...(r.status === 'CUT_FIRST' ? { begins: true } : {}),
        ...(r.context ? { ctx: { extract: r.context, page: Number(r.context_page) || 1, sha256: r.context_sha || null } } : {}) });
    }
  }

  const counts = { wrapped: 0, unwrappable: 0, noDef: 0, published: 0, held: 0, uncut: 0 };
  const unwrappable = [];
  // group by note, wrap in reverse order of position so earlier offsets hold
  const byNote = new Map();
  for (const u of units.values()) (byNote.get(u.note) ?? byNote.set(u.note, []).get(u.note)).push(u);
  for (const [note, us] of byNote) {
    const li = defLine.get(note);
    if (li === undefined) { counts.noDef += us.length; unwrappable.push(`${note}: no definition in the book`); continue; }
    const head = lines[li].match(/^\[\^[A-Za-z0-9_]+\]:\s?/)[0];
    let body = lines[li].slice(head.length);
    // locate every unit first (sequential search, non-overlapping), then rebuild
    const spans = [];
    let cursor = 0;
    for (const u of us.sort((a, b) => a.seq - b.seq)) {
      if (u.pages.length === 0 && !u.source) { counts.uncut += 1; continue; } // nothing to open and nothing to name
      if (/\]\(|<https?:/.test(u.text)) { counts.unwrappable += 1; unwrappable.push(`${u.id}: unit contains a link`); continue; }
      let at = body.indexOf(u.text, cursor);
      if (at < 0) at = body.indexOf(u.text); // out of order in the note
      if (at < 0 && u.start != null && body.slice(u.start, u.end) === u.text) at = u.start; // the lane's offsets
      if (at < 0) { counts.unwrappable += 1; unwrappable.push(`${u.id}: text not found in note (${u.text.slice(0, 50)}…)`); continue; }
      spans.push({ at, len: u.text.length, u });
      cursor = at + u.text.length;
    }
    spans.sort((a, b) => a.at - b.at);
    let out = '', pos = 0;
    for (const s of spans) {
      if (s.at < pos) { counts.unwrappable += 1; unwrappable.push(`${s.u.id}: overlaps the previous unit`); continue; }
      out += body.slice(pos, s.at) + `[${escapeLinkText(s.u.text)}](cite:${s.u.id})`;
      pos = s.at + s.len;
      s.u.wrapped = true;
      counts.wrapped += 1;
    }
    out += body.slice(pos);
    lines[li] = head + out;
  }
  md = lines.join('\n').trimEnd() + '\n';

  const servedFile = join(ROOT, 'public', 'uploads', 'research', cfg.id, '_SERVED.json');
  const served = existsSync(servedFile) ? JSON.parse(readFileSync(servedFile, 'utf8')) : {};

  // ---- 2. the extracts: public-domain only, sha-checked ------------------
  const outDir = join(ROOT, 'public', 'uploads', 'research', cfg.id, 'sources');
  mkdirSync(outDir, { recursive: true });
  const copied = new Set();
  let bytes = 0, copiedNew = 0, kept = 0;
  const wanted = new Set();
  for (const u of units.values()) {
    for (const p of u.pages) {
      if (!PUBLISHABLE.has(p.rights)) { p.file = null; continue; }
      const src = join(cfg.lane, p.extract);
      if (!existsSync(src)) { p.file = null; unwrappable.push(`${u.id}: extract missing on disk ${p.extract}`); continue; }
      const rel = p.extract.split('/').map(encodeURIComponent).join('/');
      const dst = join(outDir, p.extract);
      wanted.add(p.extract);
      if (!copied.has(p.extract)) {
        const srcSha = sha256(src);
        if (p.sha256 && p.sha256 !== srcSha) throw new Error(`${p.extract}: sha256 on disk ${srcSha.slice(0, 12)} ≠ fixity ${p.sha256.slice(0, 12)} — the lane is mid-write`);
        p.sha256 = srcSha;
        if (existsSync(dst) && sha256(dst) === srcSha) kept += 1;
        else { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); copiedNew += 1; }
        bytes += statSync(dst).size;
        copied.add(p.extract);
      } else if (!p.sha256) p.sha256 = sha256(src);
      p.file = `/uploads/research/${cfg.id}/sources/${rel}`;
    }
    if (u.pages.some((p) => p.file)) counts.published += 1;
    else if (u.pages.length || u.source) counts.held += 1;
  }
  // the reading copies: one multi-page file per work, shared by its citations; public-domain only, sha-checked
  const ctxDir = join(ROOT, 'public', 'uploads', 'research', cfg.id, 'context');
  mkdirSync(ctxDir, { recursive: true });
  const ctxCopied = new Set(); let ctxBytes = 0, ctxNew = 0, ctxKept = 0; const ctxWanted = new Set(); const ctxServed = new Map();
  for (const u of units.values()) {
    for (const p of u.pages) {
      if (!p.ctx) continue;
      if (!PUBLISHABLE.has(p.rights)) { p.ctx.file = null; continue; }
      const rel = p.ctx.extract.replace(/^_CONTEXT\//, '');
      const src = join(cfg.lane, p.ctx.extract), dst = join(ctxDir, rel);
      if (!existsSync(src)) { p.ctx.file = null; unwrappable.push(`${u.id}: context missing on disk ${p.ctx.extract}`); continue; }
      ctxWanted.add(rel);
      if (!ctxCopied.has(rel)) {
        const got = sha256(src);
        if (p.ctx.sha256 && p.ctx.sha256 !== got) throw new Error(`${p.ctx.extract}: sha256 on disk ${got.slice(0, 12)} ≠ fixity ${p.ctx.sha256.slice(0, 12)} — the lane is mid-write`);
        p.ctx.sha256 = got;
        const before = served[dst.split('/uploads/')[1]]?.served;
        const now = linearizeInto(src, dst, got, served);
        if (before === now) ctxKept += 1; else ctxNew += 1;
        ctxServed.set(rel, now);
        ctxBytes += statSync(dst).size; ctxCopied.add(rel);
      } else if (!p.ctx.sha256) p.ctx.sha256 = sha256(src);
      p.ctx.served = ctxServed.get(rel) ?? null;
      p.ctx.bytes = statSync(dst).size; // the served (linearized) size — the viewer fetches small files whole
      p.ctx.file = `/uploads/research/${cfg.id}/context/${rel.split('/').map(encodeURIComponent).join('/')}`;
    }
  }
  let ctxRemoved = 0;
  const walkCtx = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walkCtx(f); else if (f.endsWith('.pdf') && !ctxWanted.has(f.slice(ctxDir.length + 1))) { unlinkSync(f); ctxRemoved += 1; } } };
  walkCtx(ctxDir);
  const ctxExpected = new Set(rows.filter((r) => r.context && PUBLISHABLE.has(r.rights)).map((r) => r.context.replace(/^_CONTEXT\//, '')));
  const ctxOnDisk = []; const listCtx = (d, rel = '') => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) listCtx(f, r); else if (r.endsWith('.pdf')) ctxOnDisk.push(r); } };
  listCtx(ctxDir);
  const ctxExtra = ctxOnDisk.filter((f) => !ctxExpected.has(f)), ctxMissing = [...ctxExpected].filter((f) => !ctxOnDisk.includes(f));
  if (ctxExtra.length || ctxMissing.length) throw new Error(`rights gate (context): ${ctxExtra.length} extra (${ctxExtra.slice(0, 5).join(', ')}), ${ctxMissing.length} missing — nothing written`);
  for (const k of Object.keys(served)) if (!existsSync(join(ROOT, 'public', 'uploads', k))) delete served[k];
  writeFileSync(servedFile, JSON.stringify(served) + '\n');

  // a page the lane no longer cites leaves the site with it
  let removed = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.pdf') && !wanted.has(f.slice(outDir.length + 1))) { unlinkSync(f); removed += 1; } } };
  walk(outDir);
  // second, independent gate (the data seat's rule, 2026-09-14): the files on disk must equal the set of
  // `extract` values over index rows whose rights column reads public-domain — derived from the rows,
  // not from the units. A mismatch aborts before anything is written.
  const expected = new Set(rows.filter((r) => r.extract && PUBLISHABLE.has(r.rights)).map((r) => r.extract));
  const onDisk = [];
  const list = (d, rel = '') => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) list(f, r); else if (r.endsWith('.pdf')) onDisk.push(r); } };
  list(outDir);
  const extra = onDisk.filter((f) => !expected.has(f)), missing = [...expected].filter((f) => !onDisk.includes(f));
  if (extra.length || missing.length) throw new Error(`rights gate: ${extra.length} file(s) on the site are not public-domain rows of the index (${extra.slice(0, 5).join(', ')}) and ${missing.length} expected file(s) are missing — nothing written`);

  // ---- 2b. the book as a PDF with the citation boxes (v2, owner 2026-09-14 via the data seat) ----
  // _WEB/overlay.json binds a render of the book (sha256) to boxes over each citation unit's lines,
  // PyMuPDF coordinates: PDF points, origin top-left. The PDF is copied like the extracts; a render
  // whose hash differs from the manifest's, or a manifest built from another book, is refused.
  let pdf = null; const boxes = new Map(); let markers = [];
  if (overlay) {
    const o = overlay;
    const src = join(cfg.lane, '_WEB', basename(o.pdf.path));
    const got = o.pdf.sha256; // verified above
    const dst = join(ROOT, 'public', 'uploads', 'research', cfg.id, 'book.pdf');
    const bookServed = linearizeInto(src, dst, got, served);
    let linked = null;
    if (o.pdf.linked?.path) {
      const lsrc = join(cfg.lane, '_WEB', basename(o.pdf.linked.path));
      if (existsSync(lsrc) && sha256(lsrc) === o.pdf.linked.sha256) {
        const ldst = join(ROOT, 'public', 'uploads', 'research', cfg.id, 'book_linked.pdf');
        const linkedServed = linearizeInto(lsrc, ldst, o.pdf.linked.sha256, served);
        linked = { file: `/uploads/research/${cfg.id}/book_linked.pdf`, sha256: o.pdf.linked.sha256, served: linkedServed };
      } else unwrappable.push('overlay.json names a linked copy that is missing or differs — download stays the plain render');
    }
    // the render's date: the lane names it in the file (…_YYYY-MM-DD…), else the file's mtime — shown on the
    // page beside the text's import date so a render that lags the text is visible, not silent
    const dateInName = /(\d{4}-\d{2}-\d{2})/.exec(basename(o.pdf.path))?.[1];
    const rendered = dateInName || statSync(src).mtime.toISOString().slice(0, 10);
    pdf = { file: `/uploads/research/${cfg.id}/book.pdf`, sha256: got, served: bookServed, bytes: statSync(dst).size, pages: o.pdf.pages, producer: o.pdf.producer || '', origin: o.pdf.origin || 'top-left, PDF points', rendered, renderName: basename(o.pdf.path), linked };
    // the map is written again here: the book's two copies are linearized AFTER the first write, and an
    // unrecorded copy was re-linearized (new bytes, new ?v=) on every import (2026-09-15)
    writeFileSync(servedFile, JSON.stringify(served) + '\n');
    for (const b of o.units) {
      const parts = [{ page: b.page, rects: b.rects }];
      if (b.tail) parts.push({ page: b.tail.page, rects: b.tail.rects });
      boxes.set(`${b.note}/${b.seq}`, { parts, approx: !!b.approx });
    }
    markers = (o.markers || []).map((m) => ({ note: m.note, page: m.page, rect: m.rect }));
    counts.boxed = [...units.values()].filter((u) => u.wrapped && boxes.has(u.id)).length;
    counts.unboxed = [...units.values()].filter((u) => u.wrapped && !boxes.has(u.id)).map((u) => u.id);
  }

  // ---- 3. the manifest ---------------------------------------------------
  const order = [...units.values()].filter((u) => u.wrapped).sort((a, b) => a.line - b.line || a.seq - b.seq).map((u) => u.id);
  const usedSources = new Set([...units.values()].filter((u) => u.wrapped).flatMap((u) => [u.source, ...u.pages.map((p) => p.source)]).filter(Boolean));
  const manifest = {
    $comment: 'Generated by scripts/import-review-links.mjs from the research library\'s Pinned Citation Extracts lane — do not hand-edit; re-run the script.',
    slug: cfg.slug,
    id: cfg.id,
    generated: new Date().toISOString(),
    feed,
    book: { file: basename(cfg.book), sha256: bookSha, bytes: Buffer.byteLength(raw), ...(bookMeta.commit ? { commit: bookMeta.commit } : {}), ...(bookMeta.parsed ? { parsed: bookMeta.parsed } : {}) },
    rightsRule: 'Only public-domain pages are published; every other citation is marked as held in the library.',
    pdf,
    markers,
    sources: Object.fromEntries([...usedSources].sort().map((k) => {
      const s = sources[k] ?? {};
      return [k, { title: s.title || k, rights: s.rights || '', pinkind: s.pinkind || 'page', ...(s.holder_url ? { holderUrl: s.holder_url } : {}) }];
    })),
    units: order.map((id) => {
      const u = units.get(id);
      return {
        // slim: this JSON travels to the reader's browser with the page
        id: u.id, note: u.note, seq: u.seq, source: u.source, status: u.status, rights: u.rights,
        pages: u.pages.map((p) => ({ label: p.label, file: p.file, verified: p.verified, sha256: p.sha256, source: p.source, rights: p.rights, ...(p.begins ? { begins: true } : {}),
          ...(p.ctx?.file ? { context: { file: p.ctx.file, page: p.ctx.page, sha256: p.ctx.sha256, served: p.ctx.served, bytes: p.ctx.bytes } } : {}) })),
        ...(boxes.has(u.id) ? { box: boxes.get(u.id) } : {}),
      };
    }),
  };
  // The manifest is served to the browser as its own hashed, immutable JSON (public/review/<slug>.<hash>.json),
  // fetched by the review page — never inlined in the page's HTML: inlined, the immunity book's 2 MB manifest
  // rode in every page load beside the server-rendered text (a 4.2 MB page, owner 2026-09-15 "loads very slowly").
  // content/review/<slug>.json keeps the full manifest for the build (counts, static params) plus `publicUrl`.
  const body = JSON.stringify(manifest);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const pubDir = join(ROOT, 'public', 'review');
  mkdirSync(pubDir, { recursive: true });
  for (const f of readdirSync(pubDir)) if (f.startsWith(`${cfg.slug}.`) && f.endsWith('.json') && f !== `${cfg.slug}.${hash}.json`) unlinkSync(join(pubDir, f));
  writeFileSync(join(pubDir, `${cfg.slug}.${hash}.json`), body + '\n');
  manifest.publicUrl = `/review/${cfg.slug}.${hash}.json`;
  manifest.publicBytes = Buffer.byteLength(body);
  mkdirSync(join(ROOT, 'content', 'review'), { recursive: true });
  writeFileSync(join(ROOT, 'content', 'review', `${cfg.slug}.json`), JSON.stringify(manifest) + '\n');
  writeFileSync(join(ROOT, 'content', 'works', `${cfg.slug}.md`), md);

  const pages = manifest.units.reduce((n, u) => n + u.pages.filter((p) => p.file).length, 0);
  console.log(`import-review-links: ${cfg.slug} ← ${feed}`);
  console.log(`  book ${basename(cfg.book)} sha256 ${bookSha.slice(0, 16)}…  ${lines.length} lines, ${defLine.size} notes`);
  console.log(`  units: ${counts.wrapped} wrapped (${counts.published} open a published page, ${counts.held} marked held/uncut), ${counts.uncut} without a source left plain, ${counts.unwrappable} unwrappable, ${counts.noDef} with no definition`);
  if (pdf) console.log(`  book PDF: ${basename(pdf.file)} ${pdf.pages} pp. ${(pdf.bytes / 1e6).toFixed(1)} MB sha256 ${pdf.sha256.slice(0, 12)}… (${pdf.producer})${pdf.linked ? ' + linked copy' : ''}; boxes on ${counts.boxed} units, ${counts.unboxed.length} wrapped units without a box${counts.unboxed.length ? ': ' + counts.unboxed.join(', ') : ''}; ${markers.length} markers`);
  else console.log('  book PDF: none (no _WEB/overlay.json in the lane) — the review pane falls back to the rendered text');
  console.log(`  reading copies: ${ctxCopied.size} public-domain context documents (${(ctxBytes / 1e6).toFixed(1)} MB, linearized) — ${ctxNew} written, ${ctxKept} kept, ${ctxRemoved} removed; ${[...units.values()].reduce((n, u) => n + u.pages.filter((p) => p.ctx?.file).length, 0)} page links open in context`);
  console.log(`  pages: ${copied.size} public-domain extracts (${(bytes / 1e6).toFixed(1)} MB) — ${copiedNew} copied, ${kept} kept, ${removed} removed; ${pages} page links`);
  for (const w of unwrappable) console.log(`  ! ${w}`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const only = process.argv[2];
let ran = 0;
for (const cfg of REVIEWS) {
  if (only && cfg.slug !== only) continue;
  try { importOne(cfg); ran += 1; } catch (e) { console.error(`import-review-links: ${cfg.slug}: ${e.message}`); process.exitCode = 1; }
}
if (!ran) { console.error(`import-review-links: no book matched ${only ?? '(none configured)'}`); process.exitCode = 1; }
