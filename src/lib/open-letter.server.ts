// src/lib/open-letter.server.ts — the loader for content/correspondence/mn-ag-candidates-open-letter.json (server
// only: node:fs at build). Absent → null: the route answers 404 and the sitemap omits it, never a placeholder.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OPEN_LETTER_SLUG, type OpenLetterAddition, type OpenLetterAdditions, type OpenLetterContent } from './open-letter';
import { CASE_REVIEW } from './case-review.server';

const FILE = path.join(process.cwd(), 'content', 'correspondence', `${OPEN_LETTER_SLUG}.json`);

let cached: OpenLetterContent | null | undefined;

export function loadOpenLetter(): OpenLetterContent | null {
  if (cached !== undefined) return cached;
  if (!fs.existsSync(FILE)) return (cached = null);
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8')) as OpenLetterContent;
  if (!d.letter?.markdown || !d.enclosure?.markdown || !Array.isArray(d.transcript?.turns) || d.transcript.turns.length === 0) return (cached = null);
  return (cached = d);
}

export const hasOpenLetter = () => loadOpenLetter() !== null;

// the page's dated additions (the owner's word after the mailing): content/correspondence/<slug>.additions.json,
// kept by hand. Absent → none. A malformed entry or a served copy that is not the recorded bytes is a build
// error, never a silent drop: the note cites the document by its bytes.
const ADDITIONS = path.join(process.cwd(), 'content', 'correspondence', `${OPEN_LETTER_SLUG}.additions.json`);

let cachedAdditions: OpenLetterAddition[] | undefined;

// the case review's served files (public/casereview/<slug>/data/files.json): a record link names an id here
const FILES = path.join(process.cwd(), 'public', 'casereview', CASE_REVIEW.slug, 'data', 'files.json');
let filesCache: Record<string, { pages?: number; publish?: string }> | undefined;
const servedFiles = () => (filesCache ??= fs.existsSync(FILES) ? (JSON.parse(fs.readFileSync(FILES, 'utf8')) as Record<string, { pages?: number; publish?: string }>) : {});

/** the review window open at a document's PDF page — the Studio's deep-link form (docs/CASE_REVIEW_SITE.md) */
export const caseReviewDocHref = (id: string, page: number) => `/${CASE_REVIEW.slug}?casereview=doc=${encodeURIComponent(id)}&page=${page}`;

export function loadOpenLetterAdditions(): OpenLetterAddition[] {
  if (cachedAdditions !== undefined) return cachedAdditions;
  if (!fs.existsSync(ADDITIONS)) return (cachedAdditions = []);
  const d = JSON.parse(fs.readFileSync(ADDITIONS, 'utf8')) as OpenLetterAdditions;
  if (d.slug !== OPEN_LETTER_SLUG || !Array.isArray(d.additions)) throw new Error(`${ADDITIONS}: not this page's additions`);
  const seen = new Set<string>();
  for (const a of d.additions) {
    const doc = a.document;
    if (!a.id || seen.has(a.id) || !/^\d{4}-\d{2}-\d{2}$/.test(a.added ?? '') || !a.date_line || !a.markdown?.trim() || !doc?.file || !doc.title || !doc.source_url || !doc.source_label || !/^[0-9a-f]{64}$/.test(doc.sha256 ?? ''))
      throw new Error(`${ADDITIONS}: the addition ${a?.id ?? '?'} is incomplete`);
    seen.add(a.id);
    const f = path.join(process.cwd(), 'public', doc.file);
    if (!fs.existsSync(f)) throw new Error(`${ADDITIONS}: ${doc.file} is not served`);
    const buf = fs.readFileSync(f);
    if (buf.length !== doc.bytes || createHash('sha256').update(buf).digest('hex') !== doc.sha256) throw new Error(`${ADDITIONS}: ${doc.file} on disk is not the recorded copy`);
    for (const r of a.record ?? []) {
      if (!r.label || !r.title || !r.registry_id || !Number.isInteger(r.page) || r.page < 1 || !Number.isInteger(r.pages) || r.page > r.pages)
        throw new Error(`${ADDITIONS}: the record link ${r?.registry_id ?? '?'} of ${a.id} is incomplete`);
      const served = servedFiles()[r.registry_id];
      if (!served || served.publish !== 'serve') throw new Error(`${ADDITIONS}: ${r.registry_id} is not served in this site's case review`);
      if (served.pages !== r.pages) throw new Error(`${ADDITIONS}: ${r.registry_id} is served with ${served.pages} pages, the note says ${r.pages}`);
      if (!a.markdown.includes(`(${r.label})`)) throw new Error(`${ADDITIONS}: the note of ${a.id} does not name ${r.label}`);
      r.href = caseReviewDocHref(r.registry_id, r.page);
    }
  }
  return (cachedAdditions = d.additions);
}
