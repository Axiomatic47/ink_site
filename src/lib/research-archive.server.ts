// Server-only manifest reader (build time). Kept out of research-archive.ts so
// client components can import the types/helpers without pulling in node:fs.
import fs from 'node:fs';
import path from 'node:path';
import type { ArchiveManifest } from './research-archive';

export function readArchiveManifest(id: string): ArchiveManifest | null {
  const p = path.join(process.cwd(), 'public', 'uploads', 'research', id, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as ArchiveManifest;
}
