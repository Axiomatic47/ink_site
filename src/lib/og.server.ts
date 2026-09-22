// src/lib/og.server.ts — a page's social card (server only: node:fs at build).
// scripts/build_og_images.py (`npm run og:build`, manual-run) writes one 1200×630 JPEG per page under
// public/og/<key>.jpg (owner 2026-09-21: the STAC page shows its first membrane, the HLS page its first
// folio, a work its first page). A page whose card is missing keeps its tags as they were — no image —
// and the build says so, so a new leaf, render or work is never silently faceless.
//   research-<archiveId> · research-<archiveId>-<leafId> · work-<slug>
import fs from 'node:fs';
import path from 'node:path';

const warned = new Set<string>();

/** the card's site path when it exists, else null */
export function ogCard(key: string): string | null {
  const rel = `/og/${key}.jpg`;
  if (fs.existsSync(path.join(process.cwd(), 'public', rel))) return rel;
  if (!warned.has(key)) { warned.add(key); console.warn(`og: no card for ${key} — run \`npm run og:build\` and commit public/og/`); }
  return null;
}

/** openGraph.images + twitter for a page's generateMetadata; spread `...og.openGraph` into the page's openGraph block */
export function ogImages(key: string, alt: string) {
  const url = ogCard(key);
  return url
    ? { openGraph: { images: [{ url, width: 1200, height: 630, alt }] }, twitter: { card: 'summary_large_image' as const, images: [url] } }
    : { openGraph: {}, twitter: undefined };
}
