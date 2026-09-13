// src/lib/bio.server.ts — the Biography page's text (content/bio.md; server only).
// Front matter: title, updated (YYYY-MM-DD). Body: markdown. The owner edits
// the file; nothing about the owner's life is written into components.
import fs from 'node:fs';
import path from 'node:path';

export interface Bio { title: string; updated?: string; body: string }

export function readBio(): Bio | null {
  const file = path.join(process.cwd(), 'content', 'bio.md');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta: Record<string, string> = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const body = (m ? raw.slice(m[0].length) : raw).trim();
  return body ? { title: meta.title || 'Biography', updated: meta.updated, body } : null;
}
