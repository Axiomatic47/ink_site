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

/** intrinsic pixel size of a JPEG or PNG under public/ (build time), for an <img>'s width/height —
 *  the device audit flags an image without one as a layout shift (2026-09-15) */
export function imageSize(publicPath: string): { width: number; height: number } | null {
  const p = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
  if (!fs.existsSync(p)) return null;
  const b = fs.readFileSync(p);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; // PNG IHDR
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }; // SOFn
      }
      i += 2 + len;
    }
  }
  return null;
}
