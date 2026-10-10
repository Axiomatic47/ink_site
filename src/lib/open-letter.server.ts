// src/lib/open-letter.server.ts — the loader for content/correspondence/mn-ag-candidates-open-letter.json (server
// only: node:fs at build). Absent → null: the route answers 404 and the sitemap omits it, never a placeholder.
import fs from 'node:fs';
import path from 'node:path';
import { OPEN_LETTER_SLUG, type OpenLetterContent } from './open-letter';

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
