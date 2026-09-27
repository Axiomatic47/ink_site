// src/lib/review.server.ts — read the review manifests (server only: node:fs).
import { execFileSync } from 'node:child_process';
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

const OWNER_TZ = 'America/Chicago';
const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** the date, in the owner's zone, of the commit this build is building — on a production build that commit is the
    deploy, so a version the publish record does not carry yet is published by it (the build clock when git is
    unavailable; null outside a production build) */
let deployDay: string | null | undefined;
function deployDate(): string | null {
  if (process.env.CONTEXT !== 'production') return null;
  if (deployDay !== undefined) return deployDay;
  try { deployDay = localDate(execFileSync('git', ['log', '-1', '--format=%cI'], { cwd: process.cwd(), encoding: 'utf8' }).trim()); }
  catch { deployDay = localDate(new Date().toISOString()); }
  return deployDay;
}

type PublishRecord = Record<string, { date: string; commit: string }>;

/** the book's version log, newest first (content/versions/<slug>.json; none = no menu), each version carrying
    its publish date from content/versions/<slug>.published.json (scripts/stamp-published.mjs: the first main
    commit that carried it — the owner's integration, the deploy) — owner 2026-09-26: completion and
    publication are two dates, and the reviewer sees both */
export function readVersions(slug: string): BookVersion[] {
  const dir = path.join(process.cwd(), 'content', 'versions');
  const file = path.join(dir, `${slug}.json`);
  if (!fs.existsSync(file)) return [];
  const v = (JSON.parse(fs.readFileSync(file, 'utf8')) as { versions: BookVersion[] }).versions ?? [];
  const recFile = path.join(dir, `${slug}.published.json`);
  const record: PublishRecord = fs.existsSync(recFile) ? (JSON.parse(fs.readFileSync(recFile, 'utf8')) as { published?: PublishRecord }).published ?? {} : {};
  return [...v].sort((a, b) => b.version - a.version).map((x) => {
    const rec = record[String(x.version)];
    if (rec) return { ...x, published: rec.date, publishedBy: rec.commit };
    const day = deployDate();
    return day ? { ...x, published: day, publishedBy: 'this deploy' } : x;
  });
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
