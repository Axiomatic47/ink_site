#!/usr/bin/env node
// scripts/import-open-letter.mjs — the open letter to the candidates for Minnesota Attorney General, its
// Enclosure A and the MPR News debate transcript, from the owner's case tree into
// content/correspondence/<slug>.json for app/mn-ag-candidates-open-letter (owner 2026-10-09, through
// drafter a636b3d9: "publish the debate to kirchner.ink to its own new page in the site with the open
// letter (current version as a placeholder) and enclosure in the same style as my review mode with
// hyperlinks to the timestamp in which statements were made"; the letter prints the page's URL and mails
// October 10, 2026).
//
//   node scripts/import-open-letter.mjs            # read the three files at ~/Git/work_station, write the JSON
//   node scripts/import-open-letter.mjs --check    # the JSON on disk is whole (shape, counts, nothing stripped left in)
//
// NOT part of the build (the source tree is not on the build host): run it, read `git diff`, commit.
// Rules carried from the directive: ONLY these three files (the census beside the transcript relates the
// debate to another action and is not for the site); the front matter and every HTML comment (drafting
// notes, signature blocks) are stripped — nothing is rendered from them; the transcript's header (its source
// and method sentences) rides onto the page; the sources' shas and the tree's commit are recorded so a reader
// of the JSON knows which text this is. The importer refuses a source whose tree is dirty.
// Outward voice (the owner's standing rule: no seat ids and no filesystem paths where a reader reads): the
// transcript header names the drafter's seat and two of the owner's local paths; those, and only those, are
// removed from its sentences and named under `header_omitted` — as labels, never the words themselves, so the
// content file carries no path and no seat either; every other word is as written.
// Line breaks: the letter's letterhead and addressee blocks are one line per line in the markdown (the Word
// converter's cover-letter mode reads them so); on the web a single newline inside a paragraph is a soft
// break, so the importer makes each one a hard break — the letter's body paragraphs are single lines, so no
// other line moves.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SLUG = 'mn-ag-candidates-open-letter';
const OUT_DIR = join(ROOT, 'content', 'correspondence');
const OUT = join(OUT_DIR, `${SLUG}.json`);
const CHECK = process.argv.includes('--check');

const TREE = join(homedir(), 'Git', 'work_station');
const CASE = '2_MN-0-26-cv-02594-LMP-DJF';
// the index is cased 0_Workspace in git and 0_workspace on the disk (case-insensitive volume): one spelling here, git's
const SOURCES = {
  letter: `${CASE}/05_Correspondence/OPEN_LETTER_AG_CANDIDATES_ELLISON_SCHUTZ_2026-10.md`,
  enclosure: `${CASE}/05_Correspondence/OPEN_LETTER_ENCLOSURE_A_RECORD_AND_DEBATE_2026-10.md`,
  transcript: `${CASE}/0_Workspace/03_Video_Evidence/ellison_schutz_mpr_debate_20261002/TRANSCRIPT_MPR_AG_DEBATE_ELLISON_SCHUTZ_2026-10-02.md`,
};
const YOUTUBE_ID = 'pgzvG1Ky8rQ';
// THE PDFs (owner 2026-10-09: "use pdf's as we do in all our review modes"): the owner's own renderings from the
// Word build, beside the markdown in 05_Correspondence — never produced here (the device rule: agents render no
// case document; reading one is fine). The letter's PUBLISHED copy is the one without the street, the city line
// and the telephone (owner: "redact my phone number and address from the letter that's published"): pass it as
// `--letter-pdf <path>`; without the flag the letter is served as text only (the page falls back to the text
// version in the left pane) and `--check` refuses a served letter PDF whose text carries a telephone number or the
// street. The enclosure's PDF carries no letterhead and rides by default (`--enclosure-pdf <path>` to override).
const PDF_DEFAULTS = {
  enclosure: `${CASE}/05_Correspondence/OPEN_LETTER_ENCLOSURE_A_RECORD_AND_DEBATE_2026-10.pdf`,
};
const opt = (f) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const LETTER_PDF = opt('--letter-pdf');
const ENCLOSURE_PDF = opt('--enclosure-pdf') ?? join(TREE, PDF_DEFAULTS.enclosure);
const UPLOADS_DIR = join(ROOT, 'public', 'uploads', 'correspondence', SLUG);
const UPLOADS_URL = `/uploads/correspondence/${SLUG}`;
// the same pattern as src/lib/open-letter.ts DEBATE_TIME_RE (the TypeScript one is the one of record; the test
// asserts the two are equal, so a change there is a change here)
export const DEBATE_TIME_RE_IMPORT = /(?<!\d)(?<!\d:)(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s?[–—-]\s?(\d{1,2}:[0-5]\d(?::[0-5]\d)?))?(?!\d|:\d|-cv)/g;

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['-C', TREE, ...a], { encoding: 'utf8' }).trim();
const fail = (m) => { console.error(`import-open-letter: ${m}`); process.exit(1); };

// ---------------------------------------------------------------- markdown helpers
/** `---` front matter → {meta, body}; values unquoted */
function splitFrontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: md.slice(m[0].length) };
}
/** every HTML comment, whole (drafting notes, signature blocks) */
const stripComments = (md) => md.replace(/<!--[\s\S]*?-->/g, '');
/** a single newline between two non-blank lines inside a paragraph becomes a hard break */
const hardBreaks = (md) => md.split('\n').map((l, i, a) => (l.trim() && a[i + 1] !== undefined && a[i + 1].trim() && !/^[-*]\s|^\d+\.\s|^\|/.test(a[i + 1]) && !/^#/.test(l) ? `${l}  ` : l)).join('\n');
const tidy = (md) => md.replace(/\n{3,}/g, '\n\n').trim() + '\n';

/** "2:49" → 169, "00:12:37" → 757 */
function clockSeconds(s) {
  const p = s.split(':').map(Number);
  if (p.some((x) => !Number.isInteger(x))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
}

// ---------------------------------------------------------------- the letterhead (owner 2026-10-09: "redact my phone
// number and address from the letter that's published"). The letterhead is the body's first paragraph — the name,
// the street, the city line, the email, the telephone, one per line. The published copy keeps the NAME and the EMAIL
// (the email is on every page of this site) and drops every other line; what was dropped is recorded by label. The
// addressee blocks (the campaigns' public addresses) are not touched.
const PHONE_RE = /\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/;
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
function redactLetterhead(md) {
  const lines = md.replace(/^\s+/, '').split('\n');
  const end = lines.findIndex((l) => !l.trim());
  const head = end < 0 ? lines : lines.slice(0, end);
  if (!/^\*\*[^*]+\*\*$/.test(head[0] || '')) fail(`letter: the letterhead does not begin with the bold name line (got: ${(head[0] || '').slice(0, 40)})`);
  const kept = [], redacted = [];
  for (const l of head) {
    const t = l.trim();
    if (t === head[0].trim() || EMAIL_RE.test(t)) kept.push(l);
    else if (PHONE_RE.test(t)) redacted.push('the telephone number');
    else redacted.push(/^\d/.test(t) ? 'the street address' : 'the city line');
  }
  if (!kept.some((l) => EMAIL_RE.test(l.trim()))) fail('letter: the letterhead has no email line to keep');
  return { md: [...kept, ...lines.slice(head.length)].join('\n'), redacted };
}

// ---------------------------------------------------------------- the transcript
function parseTranscript(md) {
  const lines = md.split('\n');
  const head = lines.findIndex((l) => /^\|\s*Turn\s*\|/.test(l));
  if (head < 0) fail('transcript: no "| Turn |" table head');
  const headerMd = lines.slice(0, head).join('\n');
  const title = (headerMd.match(/^#\s+(.+)$/m) || [])[1]?.trim();
  if (!title) fail('transcript: no H1');
  const para = (label) => (headerMd.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'm')) || [])[1]?.trim();
  const sourceLine = para('Source recording');
  const methodLine = para('Method');
  if (!sourceLine || !methodLine) fail('transcript: the Source recording / Method paragraphs are not where the header had them');

  // the recording's facts, read from the source line as written
  const idM = sourceLine.match(/YouTube id (\w+)/);
  const durM = sourceLine.match(/duration (\d+:\d\d(?::\d\d)?)(?:\.\d+)?/);
  const fileM = sourceLine.match(/`~\/Movies\/(.+?) \[(\w+)\]\.mp4`/);
  if (!idM || idM[1] !== YOUTUBE_ID) fail(`transcript: YouTube id ${idM?.[1]} is not ${YOUTUBE_ID}`);
  const recordingTitle = fileM ? fileM[1].replace(/：/g, ':').replace(/｜/g, '|') : null;
  // what was omitted is recorded as a LABEL, never the words (a636b3d9 2026-10-09: the clauses verbatim would put
  // the local paths and the seat id in the repo's content file even though the page never renders them)
  const omitted = [];
  // outward voice: the clause describing the owner's local file (path, bytes, sha256) goes; the broadcast
  // sentence and the clock rule stay, as written
  let source = sourceLine;
  const localClause = source.match(/^`~\/Movies\/[^`]+`\s*\([^)]*\)\.\s*/);
  if (localClause) { omitted.push("the source recording's local file (its path, size and sha256)"); source = source.slice(localClause[0].length); }
  let method = methodLine;
  for (const [re, label] of [[/\s*\(the owner's model at `~\/models\/whisper-cpp\/`\)/, "the model's local path"], [/\s*by drafter [0-9a-f]{8}\b/, "the transcriber's seat"]]) {
    if (re.test(method)) { omitted.push(label); method = method.replace(re, ''); }
  }
  if (/~\/|[0-9a-f]{8}-[0-9a-f]{4}/.test(source + method)) fail('transcript header still carries a local path or a session id');

  const rows = lines.slice(head + 2).filter((l) => l.startsWith('|'));
  const turns = rows.map((l) => {
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (c.length !== 4) fail(`transcript row with ${c.length} cells: ${l.slice(0, 60)}`);
    const t = clockSeconds(c[1]);
    if (t == null) fail(`transcript row ${c[0]}: time ${c[1]}`);
    return { n: Number(c[0]), time: c[1], t, speaker: c[2], text: c[3] };
  });
  turns.forEach((r, i) => { if (r.n !== i + 1) fail(`transcript turn ${r.n} out of order at row ${i + 1}`); if (i && r.t < turns[i - 1].t) fail(`transcript turn ${r.n} runs backwards`); });
  // the speaker key, from the header's own parenthesis
  const speakers = {};
  for (const m of methodLine.matchAll(/\b([A-Z]{2,3}) = ([A-Z][\w.]+(?: [A-Z][\w.]+)*)/g)) speakers[m[1]] = m[2];
  if (!speakers.MOD || !speakers.KE || !speakers.RS) fail(`transcript: speaker key read as ${JSON.stringify(speakers)}`);
  return {
    title, source, method, header_omitted: omitted, speakers, turns,
    recording: { youtube_id: YOUTUBE_ID, url: `https://www.youtube.com/watch?v=${YOUTUBE_ID}`, title: recordingTitle, duration: durM ? durM[1] : null, duration_s: durM ? clockSeconds(durM[1]) : null },
  };
}

// ---------------------------------------------------------------- the PDFs: boxes over every debate time
const unent = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
/** poppler's word boxes (points, origin top-left) → one box per word a debate time runs through, with its second */
function pdfBoxes(pdfPath) {
  const xml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const pages = []; const boxes = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  for (const pm of xml.matchAll(pageRe)) {
    const pageNo = pages.push({ w: Number(pm[1]), h: Number(pm[2]) });
    for (const lm of pm[3].matchAll(/<line [^>]*>([\s\S]*?)<\/line>/g)) {
      const words = [...lm[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
        .map((w) => ({ rect: [Number(w[1]), Number(w[2]), Number(w[3]), Number(w[4])], text: unent(w[5]) }));
      let text = '', at = 0;
      const spans = words.map((w) => { const s = at; text += (text ? ' ' : '') + w.text; at = text.length; return [s + (s ? 1 : 0), at]; });
      for (const m of text.matchAll(DEBATE_TIME_RE_IMPORT)) {
        const t = clockSeconds(m[1]);
        if (t == null) continue;
        const a = m.index, b = m.index + m[0].length;
        words.forEach((w, i) => { const [s, e] = spans[i]; if (s < b && e > a) boxes.push({ page: pageNo, rect: w.rect.map((v) => Math.round(v * 100) / 100), t, label: m[0] }); });
      }
    }
  }
  if (!pages.length) fail(`${pdfPath}: pdftotext read no pages`);
  return { pages, boxes };
}
/** copy an owner-rendered PDF into the served tree and describe it: file, sha, bytes, pages, the time boxes */
function importPdf(role, srcPath) {
  if (!existsSync(srcPath)) fail(`${role} PDF missing: ${srcPath}`);
  // the letter's text is read and judged BEFORE anything is written: a refused copy never reaches the served tree
  const text = execFileSync('pdftotext', [srcPath, '-'], { encoding: 'utf8' });
  if (role === 'letter' && (PHONE_RE.test(text) || /Parklawn|\b55435\b/.test(text))) fail(`the letter PDF at ${srcPath} carries the telephone number or the street — pass the PUBLISHED copy (the letterhead without them), never this one; nothing written`);
  const buf = readFileSync(srcPath);
  const sha = sha256(buf);
  const { pages, boxes } = pdfBoxes(srcPath);
  if (!boxes.length) fail(`${role} PDF: no debate time found on its pages; nothing written`);
  mkdirSync(UPLOADS_DIR, { recursive: true });
  const name = `${role}.pdf`;
  writeFileSync(join(UPLOADS_DIR, name), buf);
  return { file: `${UPLOADS_URL}/${name}`, sha256: sha, bytes: buf.length, pages: pages.length, page_sizes: pages, boxes };
}

// ---------------------------------------------------------------- check
function check() {
  if (!existsSync(OUT)) fail(`${OUT} missing — run the import`);
  const d = JSON.parse(readFileSync(OUT, 'utf8'));
  const bad = [];
  for (const k of ['letter', 'enclosure']) {
    const md = d[k]?.markdown ?? '';
    if (!md.trim()) bad.push(`${k}: empty`);
    if (/<!--/.test(md)) bad.push(`${k}: an HTML comment survived`);
    if (/^---\n/.test(md)) bad.push(`${k}: front matter survived`);
    if (/LEGAL-ANALYSIS-SIG/.test(md)) bad.push(`${k}: a signature block survived`);
  }
  // the published letterhead is the name and the email, nothing else (owner 2026-10-09)
  const head = (d.letter?.markdown ?? '').split(/\n\s*\n/)[0].split('\n').map((l) => l.trim()).filter(Boolean);
  if (head.length !== 2 || !/^\*\*[^*]+\*\*$/.test(head[0]) || !EMAIL_RE.test(head[1])) bad.push(`letterhead: expected the name and the email only, got ${head.length} lines`);
  if (PHONE_RE.test(d.letter?.markdown ?? '')) bad.push('letter: a telephone number is in the published text');
  if (!Array.isArray(d.letter?.redacted) || d.letter.redacted.length === 0) bad.push('letter: no redaction recorded');
  // the served PDFs: present, the registry's bytes, the time boxes inside their pages; the letter's text clean
  for (const role of ['letter', 'enclosure']) {
    const p = d[role]?.pdf;
    if (!p) continue;
    const f = join(ROOT, 'public', p.file);
    if (!existsSync(f)) { bad.push(`${role} PDF missing on disk: ${p.file}`); continue; }
    const buf = readFileSync(f);
    if (sha256(buf) !== p.sha256 || buf.length !== p.bytes) bad.push(`${role} PDF on disk is not the recorded one`);
    if (!Array.isArray(p.boxes) || !p.boxes.length) bad.push(`${role} PDF: no time boxes`);
    for (const b of p.boxes || []) { const s = p.page_sizes?.[b.page - 1]; if (!s || b.rect[0] < 0 || b.rect[1] < 0 || b.rect[2] > s.w || b.rect[3] > s.h || b.rect[2] <= b.rect[0] || b.rect[3] <= b.rect[1]) bad.push(`${role} PDF: a box off its page (p. ${b.page} ${b.label})`); }
    if (role === 'letter') {
      const text = execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' });
      if (PHONE_RE.test(text) || /Parklawn|\b55435\b/.test(text)) bad.push('letter PDF: the telephone number or the street is in its text — not the published copy');
    }
  }
  const t = d.transcript;
  if (!t || !Array.isArray(t.turns) || t.turns.length < 100) bad.push('transcript: fewer than 100 turns');
  if (t && /~\/|[0-9a-f]{8}-[0-9a-f]{4}|drafter [0-9a-f]{8}/.test(`${t.source} ${t.method}`)) bad.push('transcript header: a local path or a seat id');
  if (t && (t.header_omitted || []).some((x) => /~\/|`|[0-9a-f]{8}\b|sha256 [0-9a-f]/.test(x))) bad.push('header_omitted: carries the omitted words, not a label');
  if (d.recording?.youtube_id !== YOUTUBE_ID) bad.push('recording id');
  if (!d.source?.files?.length || d.source.files.some((f) => !/^[0-9a-f]{64}$/.test(f.sha256) || !/^[0-9a-f]{40}$/.test(f.commit))) bad.push('source files: a sha or a commit missing');
  if (bad.length) { bad.forEach((b) => console.error(`  ${b}`)); fail('check failed'); }
  console.log(`open letter ok: ${t.turns.length} turns, letter ${d.letter.markdown.length} chars, enclosure ${d.enclosure.markdown.length} chars; sources at ${d.source.commit.slice(0, 8)}`);
}

// ---------------------------------------------------------------- import
function main() {
  if (CHECK) return check();
  for (const rel of Object.values(SOURCES)) if (!existsSync(join(TREE, rel))) fail(`missing: ${rel}`);
  const dirty = git('status', '--porcelain', '--', ...Object.values(SOURCES));
  if (dirty) fail(`the sources have uncommitted changes — commit them in the case tree first:\n${dirty}`);
  const commit = git('rev-parse', 'HEAD');
  const files = Object.entries(SOURCES).map(([role, rel]) => {
    const buf = readFileSync(join(TREE, rel));
    return { role, path: rel, bytes: buf.length, sha256: sha256(buf), commit: git('log', '-1', '--format=%H', '--', rel) };
  });
  const read = (role) => readFileSync(join(TREE, SOURCES[role]), 'utf8');

  const L = splitFrontMatter(read('letter'));
  const E = splitFrontMatter(read('enclosure'));
  const { md: letterBody, redacted } = redactLetterhead(stripComments(L.body));
  const letterMd = tidy(hardBreaks(letterBody));
  const enclosureMd = tidy(stripComments(E.body));
  const dateM = letterMd.match(/^(October|November|December|January|February|March|April|May|June|July|August|September) \d{1,2}, \d{4}$/m);
  const transcript = parseTranscript(read('transcript'));
  const letterPdf = LETTER_PDF && LETTER_PDF !== 'none' ? importPdf('letter', LETTER_PDF) : null;
  const enclosurePdf = ENCLOSURE_PDF !== 'none' ? importPdf('enclosure', ENCLOSURE_PDF) : null;

  const out = {
    $comment: 'Written by scripts/import-open-letter.mjs from the owner\'s case tree — the open letter, its enclosure and the debate transcript, front matter and HTML comments stripped, the transcript header\'s local paths and seat attribution omitted and named by label under header_omitted. Do not edit by hand; re-run the import.',
    slug: SLUG,
    generated: new Date().toISOString(),
    source: { tree: 'work_station', commit, files },
    recording: { ...transcript.recording, programme: 'MPR News Politics Friday', date: '2026-10-02', moderator: transcript.speakers.MOD },
    letter: { title: L.meta.title ?? 'Open letter', header: L.meta.header ?? null, date_line: dateM ? dateM[0] : null, redacted, markdown: letterMd, pdf: letterPdf },
    enclosure: { title: E.meta.title ?? 'Enclosure A', header: E.meta.header ?? null, markdown: enclosureMd, pdf: enclosurePdf },
    transcript: { title: transcript.title, source: transcript.source, method: transcript.method, header_omitted: transcript.header_omitted, speakers: transcript.speakers, turns: transcript.turns },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`import-open-letter: ${SLUG} ← work_station ${commit.slice(0, 8)}`);
  for (const f of files) console.log(`  ${f.role.padEnd(10)} ${f.sha256.slice(0, 12)}  ${f.bytes.toString().padStart(6)} B  ${f.commit.slice(0, 8)}  ${f.path}`);
  console.log(`  letter ${letterMd.length} chars (date line: ${out.letter.date_line}); enclosure ${enclosureMd.length} chars; transcript ${transcript.turns.length} turns, ${transcript.recording.duration} on the recording's clock; header clauses omitted: ${transcript.header_omitted.length}`);
  for (const [role, p] of [['letter', letterPdf], ['enclosure', enclosurePdf]]) console.log(p ? `  ${role.padEnd(10)} PDF ${p.sha256.slice(0, 12)}  ${String(p.bytes).padStart(6)} B  ${p.pages} pp  ${p.boxes.length} time boxes → ${p.file}` : `  ${role.padEnd(10)} PDF none (${role === 'letter' ? 'pass --letter-pdf <the published copy>' : '--enclosure-pdf none'})`);
  console.log(`  → ${OUT}`);
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
