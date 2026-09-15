// src/lib/review.server.ts — read the review manifests (server only: node:fs).
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewManifest } from './review';

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
