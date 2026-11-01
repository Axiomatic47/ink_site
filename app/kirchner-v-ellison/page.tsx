// app/kirchner-v-ellison/page.tsx — the MN case in review mode (owner 2026-10-09: "Both sites will host the dmn review as
// well as and primarily the local review in ourstudio"): the filings listed at the far left as the Studio lists them
// (docket order descending, attachments under their main), the document under review on the left, the cited source
// at its page on the right. The window is the Studio's, vendored (public/casereview/vendor); this page is its host —
// a thin site bar above the window's own head row (R3, 2026-10-21; the one-row head this page drew is the window's now). The bundle it reads
// (public/casereview/kirchner-v-ellison/data — the keyed layout of a case that is not the importer's default) is the
// lane as the Studio serves it, published by the registry's word (scripts/import-casereview.mjs). Without a bundle
// the route is a 404 and no sitemap entry — never a placeholder (the site's rule for every content page).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CaseReviewMount, type CaseReviewHead } from './CaseReviewMount';
import { CASE_REVIEW, caseReviewStamp, defaultDocument } from '@/lib/case-review.server';
import './casereview.css';

export const metadata: Metadata = {
  title: `${CASE_REVIEW.caption} — the case in review`,
  description: `${CASE_REVIEW.caption}, No. ${CASE_REVIEW.caseNo} (${CASE_REVIEW.court}): the filings with every citation linked to its source, in two panes.`,
  alternates: { canonical: `/${CASE_REVIEW.slug}` },
};

export default function CaseReviewPage() {
  const stamp = caseReviewStamp();
  if (!stamp) notFound();
  // R3 (2026-10-21): the head row is the WINDOW'S, drawn from these words (the way back, the caption, the docket line, the
  // mode, the registry stamp); the site's nav, which this page's one-row head used to carry, stays as a thin site bar
  // above it — the host shell — and the site links the window's vendored stylesheet beside its own token sheet
  const head: CaseReviewHead = {
    caption: CASE_REVIEW.caption,
    line: `No. ${CASE_REVIEW.caseNo} · ${CASE_REVIEW.court}${CASE_REVIEW.appeal ? ` · ${CASE_REVIEW.appeal}` : ''}`,
    mode: 'Case review',
    version: stamp.registry_version || null,
    back: { href: '/', label: 'kirchner.ink' },
  };
  return (
    <main className="cr-host">
      <link rel="stylesheet" href="/casereview/vendor/casereview.css" precedence="default" />
      <nav aria-label="Site" className="cr-sitebar">
        <Link href="/" aria-label="kirchner.ink home" className="cr-brand">kirchner.ink</Link>
        <Link href="/mn-ag-candidates-open-letter">The open letter</Link>
        <Link href="/work">Articles</Link>
        <Link href="/contact">Contact</Link>
      </nav>
      <CaseReviewMount root={CASE_REVIEW.slug} defaultDoc={defaultDocument(stamp)} head={head} />
    </main>
  );
}
