import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Columns } from 'lucide-react';
import { works, workBySlug, collectionBySlug, worksIn } from '@/lib/works';
import { ogImages } from '@/lib/og.server';
import { readWorkBody } from '@/lib/works.server';
import { readReview } from '@/lib/review.server';
import { publishedUnits, reviewMeta } from '@/lib/review';
import { SiteShell } from '../../_components/SiteShell';
import { PdfViewer } from '../../_components/PdfViewer';
import { ArticleBody } from '../../_components/ArticleBody';
import { ReviewLoader } from './review/ReviewLoader';

export const dynamicParams = false;
export function generateStaticParams() {
  return works.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = workBySlug((await params).slug);
  if (!w) return {};
  const description = w.blurb ?? w.subtitle ?? w.title;
  const og = ogImages(`work-${w.slug}`, `${w.title} — the first page`); // scripts/build_og_images.py (owner 2026-09-21)
  return {
    title: w.title,
    description,
    alternates: { canonical: `/work/${w.slug}` },
    openGraph: { title: w.title, description, type: 'article', url: `/work/${w.slug}`, ...og.openGraph },
    twitter: og.twitter,
  };
}

const longDate = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const w = workBySlug((await params).slug);
  if (!w) notFound();
  const collection = collectionBySlug(w.collection);
  const siblings = worksIn(w.collection);
  const i = siblings.findIndex((x) => x.slug === w.slug);
  const prev = siblings[i - 1], next = siblings[i + 1];
  const body = w.pdf ? null : readWorkBody(w);
  // a reviewed book: its citations open the cited page on the review route
  const review = body ? readReview(w.slug) : null;
  // owner 2026-09-14: a reviewed book opens STRAIGHT into review mode; the
  // rendered text is one click away at /work/<slug>/text
  if (review && body) {
    return (
      <ReviewLoader work={{ slug: w.slug, title: w.title, subtitle: w.subtitle, venue: w.venue }} meta={reviewMeta(review)} textHref={`/work/${w.slug}/text`} backHref={`/work#${w.collection}`} backLabel={collection ? collection.title : 'All articles'}>
        {review.pdf ? undefined : <ArticleBody bare citeBase="">{body}</ArticleBody>}
      </ReviewLoader>
    );
  }
  const reviewHref = undefined;
  return (
    <SiteShell>
      <Link href={`/work#${w.collection}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">
        <ArrowLeft className="h-4 w-4" /> {collection ? collection.title : 'All articles'}
      </Link>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        <aside className="lg:sticky lg:top-8 rounded-lg border border-rule bg-card shadow-card p-6">
          <p className="text-xs text-muted mb-2">{[w.date ? longDate(w.date) : w.year, w.venue].filter(Boolean).join(' · ')}</p>
          <h1 className="font-serif text-3xl leading-tight" style={{ fontWeight: 620 }}>{w.title}</h1>
          {w.subtitle && <p className="font-serif text-xl text-muted mt-2 leading-snug">{w.subtitle}</p>}
          {w.blurb && <p className="text-sm leading-relaxed text-ink/85 mt-4">{w.blurb}</p>}
          {review && (
            <Link href={reviewHref!} className="mt-5 flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 no-underline hover:bg-accent/20 transition-colors">
              <Columns className="h-4 w-4 mt-0.5 shrink-0 text-accent-ink" />
              <span className="text-sm leading-snug text-ink">
                <span style={{ fontWeight: 600 }}>Review mode</span> — the text beside the cited pages: {publishedUnits(review).length.toLocaleString('en-US')} citations open the page they cite, from {Object.keys(review.sources).length} sources.
              </span>
            </Link>
          )}
          {collection && (
            <p className="text-xs text-muted mt-4">
              Part of <Link href={`/work#${collection.slug}`} className="text-accent-ink underline">{collection.title}</Link>
              {siblings.length > 1 ? ` · ${i + 1} of ${siblings.length}` : ''}
            </p>
          )}
          {(prev || next) && (
            <nav aria-label="Other articles in this collection" className="mt-6 pt-4 border-t border-rule grid gap-3 text-sm">
              {prev && <Link href={`/work/${prev.slug}`} className="text-muted hover:text-ink no-underline">← {prev.title}</Link>}
              {next && <Link href={`/work/${next.slug}`} className="text-muted hover:text-ink no-underline">{next.title} →</Link>}
            </nav>
          )}
        </aside>
        <section className="min-w-0">
          {w.pdf ? (
            <PdfViewer src={w.pdf} title={w.title} downloadName={w.pdf.split('/').pop()} />
          ) : body ? (
            <ArticleBody citeBase={reviewHref}>{body}</ArticleBody>
          ) : (
            <p className="text-muted">This article is not yet available in the reader.</p>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
