// src/lib/open-letter.server.ts — the loader for content/correspondence/mn-ag-candidates-open-letter.json (server
// only: node:fs at build). Absent → null: the route answers 404 and the sitemap omits it, never a placeholder.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { OPEN_LETTER_SLUG, type OpenLetterAddition, type OpenLetterAdditions, type OpenLetterContent } from './open-letter';

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
  }
  return (cachedAdditions = d.additions);
}
