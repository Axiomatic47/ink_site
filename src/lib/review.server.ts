// src/lib/review.server.ts — read the review manifests (server only: node:fs).
import fs from 'node:fs';
import path from 'node:path';
import type { BookVersion, EditionMap, ReviewManifest } from './review';
import { RESEARCH_ARCHIVES, archiveBase, publishedDocs } from './research-archive';
import { readArchiveManifest } from './research-archive.server';

const DIR = path.join(process.cwd(), 'content', 'review');

/** slugs with a review manifest (content/review/<slug>.json) */
export function reviewSlugs(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

export function readReview(slug: string): ReviewManifest | null {
  const file = path.join(DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ReviewManifest;
}

/** the book's version log, newest first (content/versions/<slug>.json; none = no menu) */
export function readVersions(slug: string): BookVersion[] {
  const file = path.join(process.cwd(), 'content', 'versions', `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  const v = (JSON.parse(fs.readFileSync(file, 'utf8')) as { versions: BookVersion[] }).versions ?? [];
  return [...v].sort((a, b) => b.version - a.version);
}

/** every archive leaf that serves an EDITION (a professional transcription), keyed `${archiveId}/${leafId}` — the
    review pane opens a held page's transcription at its leaf's page when the chip links to that leaf (owner 2026-09-21) */
export function editionLeaves(): EditionMap {
  const out: EditionMap = {};
  for (const [archiveId, cfg] of Object.entries(RESEARCH_ARCHIVES)) {
    const m = readArchiveManifest(archiveId);
    if (!m || m.images?.published !== true) continue;
    for (const leaf of m.leaves) {
      const doc = publishedDocs(leaf).find((d) => d.kind === 'edition');
      if (!doc) continue;
      out[`${archiveId}/${leaf.id}`] = {
        archiveId, leafId: leaf.id, leafLabel: cfg.leafLabel, leafUrl: `/research/${archiveId}/leaf/${leaf.id}`,
        pdf: `${archiveBase(archiveId)}/${doc.pdf}`, sha256: doc.sha256 ?? null, page: doc.page ?? 1,
        title: doc.title, credit: doc.credit ?? '', author: doc.author,
        image: `${archiveBase(archiveId)}/${leaf.web ?? leaf.image}`, imageCredit: leaf.credit ?? null,
      };
    }
  }
  return out;
}
