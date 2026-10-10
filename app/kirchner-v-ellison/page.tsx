// app/kirchner-v-ellison/page.tsx — the MN case in review mode (owner 2026-10-09: "Both sites will host the dmn review as
// well as and primarily the local review in ourstudio"): the filings listed at the far left as the Studio lists them
// (docket order descending, attachments under their main), the document under review on the left, the cited source
// at its page on the right. The window is the Studio's, vendored (public/casereview/vendor); this page is its host
// and the one-row head above it, which carries the site's nav. The bundle it reads
// (public/casereview/kirchner-v-ellison/data — the keyed layout of a case that is not the importer's default) is the
// lane as the Studio serves it, published by the registry's word (scripts/import-casereview.mjs). Without a bundle
// the route is a 404 and no sitemap entry — never a placeholder (the site's rule for every content page).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CaseReviewMount } from './CaseReviewMount';
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
  return (
    <main className="cr-host">
      <header className="cr-head">
        <Link href="/" aria-label="kirchner.ink home">kirchner.ink</Link>
        <span className="cr-caption">Kirchner <span className="v">v.</span> Ellison</span>
        <span className="cr-no">No. {CASE_REVIEW.caseNo} · {CASE_REVIEW.court}{CASE_REVIEW.appeal ? ` · ${CASE_REVIEW.appeal}` : ''}</span>
        <nav aria-label="Site" className="cr-nav-links">
          <Link href="/mn-ag-candidates-open-letter">The open letter</Link>
          <Link href="/work">Articles</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <span className="cr-mode">Case review{stamp.registry_version ? ` · registry ${stamp.registry_version}` : ''}</span>
      </header>
      <CaseReviewMount root={CASE_REVIEW.slug} defaultDoc={defaultDocument(stamp)} />
    </main>
  );
}
