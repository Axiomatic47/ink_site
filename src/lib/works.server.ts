// src/lib/works.server.ts — the article text (server only: node:fs).
import fs from 'node:fs';
import path from 'node:path';
import type { Work } from './works';

/** the markdown body of a text article, or null for a PDF article */
export function readWorkBody(w: Work): string | null {
  if (!w.body) return null;
  const file = path.join(process.cwd(), w.body.replace(/^\//, ''));
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
