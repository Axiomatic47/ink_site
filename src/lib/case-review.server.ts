// src/lib/case-review.server.ts — the Case Review host table of this site (server-only: reads the bundle's stamp).
// One case today: Kirchner v. Ellison (the MN case), the owner's word of 2026-10-09 — both sites host the DMN review,
// the Studio's local review primary. The bundle lives at the importer's KEYED layout for a case that is not its
// default (public/casereview/<slug>/data), and the page exists only while the bundle does.
import fs from 'node:fs';
import path from 'node:path';

export const CASE_REVIEW = {
  slug: 'kirchner-v-ellison',
  caption: 'Kirchner v. Ellison',
  caseNo: '0:26-cv-02594-LMP-DJF',
  court: 'D. Minn.',
  appeal: '8th Cir. No. 26-1615',
} as const;

export interface ImportStamp { default_doc?: string | null; registry_version?: string | null; counts?: Record<string, number> }

const stampPath = () => path.join(process.cwd(), 'public', 'casereview', CASE_REVIEW.slug, 'data', '_IMPORT.json');

/** the bundle's stamp, or null when no bundle is on disk (the route is then a 404 and out of the sitemap) */
export function caseReviewStamp(): ImportStamp | null {
  try { return JSON.parse(fs.readFileSync(stampPath(), 'utf8')) as ImportStamp; } catch { return null; }
}

export const hasCaseReview = () => caseReviewStamp() !== null;

/** the document the page opens when the URL names none — the one skin decision the Studio leaves to its host: the
    importer's default (the newest filing with a link table) when it has one, else the NEWEST served document with a
    link table (its filed date, then the registry's order — the same rule as lawsofexistence.com's host, so the two
    sites open the MN case on the same document: today the open letter), else nothing — the window then opens on the
    tree alone, as the Studio does */
export function defaultDocument(stamp: ImportStamp): string | null {
  if (stamp.default_doc) return stamp.default_doc;
  try {
    const docs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'casereview', CASE_REVIEW.slug, 'data', 'docs.json'), 'utf8')) as
      { docs?: { id: string; filed?: string | null; publish?: string }[]; links?: Record<string, { rows?: number }> };
    const filedKey = (d: { filed?: string | null }) => { const m = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(d.filed ?? ''); return m ? Number(`20${m[3]}${m[1]}${m[2]}`) : 0; };
    const withTable = (docs.docs ?? []).filter((d) => d.publish === 'serve' && (docs.links?.[d.id]?.rows ?? 0) > 0);
    withTable.sort((a, b) => filedKey(b) - filedKey(a));   // a stable sort: the registry's order within one date
    return withTable[0]?.id ?? null;
  } catch { return null; }
}
