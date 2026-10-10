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
  const letterMd = tidy(hardBreaks(stripComments(L.body)));
  const enclosureMd = tidy(stripComments(E.body));
  const dateM = letterMd.match(/^(October|November|December|January|February|March|April|May|June|July|August|September) \d{1,2}, \d{4}$/m);
  const transcript = parseTranscript(read('transcript'));

  const out = {
    $comment: 'Written by scripts/import-open-letter.mjs from the owner\'s case tree — the open letter, its enclosure and the debate transcript, front matter and HTML comments stripped, the transcript header\'s local paths and seat attribution omitted and named by label under header_omitted. Do not edit by hand; re-run the import.',
    slug: SLUG,
    generated: new Date().toISOString(),
    source: { tree: 'work_station', commit, files },
    recording: { ...transcript.recording, programme: 'MPR News Politics Friday', date: '2026-10-02', moderator: transcript.speakers.MOD },
    letter: { title: L.meta.title ?? 'Open letter', header: L.meta.header ?? null, date_line: dateM ? dateM[0] : null, markdown: letterMd },
    enclosure: { title: E.meta.title ?? 'Enclosure A', header: E.meta.header ?? null, markdown: enclosureMd },
    transcript: { title: transcript.title, source: transcript.source, method: transcript.method, header_omitted: transcript.header_omitted, speakers: transcript.speakers, turns: transcript.turns },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`import-open-letter: ${SLUG} ← work_station ${commit.slice(0, 8)}`);
  for (const f of files) console.log(`  ${f.role.padEnd(10)} ${f.sha256.slice(0, 12)}  ${f.bytes.toString().padStart(6)} B  ${f.commit.slice(0, 8)}  ${f.path}`);
  console.log(`  letter ${letterMd.length} chars (date line: ${out.letter.date_line}); enclosure ${enclosureMd.length} chars; transcript ${transcript.turns.length} turns, ${transcript.recording.duration} on the recording's clock; header clauses omitted: ${transcript.header_omitted.length}`);
  console.log(`  → ${OUT}`);
}
main();
