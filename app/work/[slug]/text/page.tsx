// /work/<slug>/text — the rendered text of a reviewed book (the book itself
// opens in review mode at /work/<slug>, owner 2026-09-14). Same reader as any
// text article; its citation links lead back into review mode.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Columns } from 'lucide-react';
import { workBySlug, collectionBySlug } from '@/lib/works';
import { ogImages } from '@/lib/og.server';
import { readWorkBody } from '@/lib/works.server';
import { readReview, reviewSlugs } from '@/lib/review.server';
import { SiteShell } from '../../../_components/SiteShell';
import { ArticleBody } from '../../../_components/ArticleBody';

export const dynamicParams = false;
export function generateStaticParams() {
  return reviewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = workBySlug((await params).slug);
  if (!w) return {};
  const title = `${w.title} — text`, description = w.blurb ?? w.subtitle ?? w.title;
  const og = ogImages(`work-${w.slug}`, `${w.title} — the first page`); // the work's card (scripts/build_og_images.py)
  return { title, description, alternates: { canonical: `/work/${w.slug}/text` }, openGraph: { title, description, type: 'article', url: `/work/${w.slug}/text`, ...og.openGraph }, twitter: og.twitter };
}

const longDate = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');

export default async function ReviewedTextPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = workBySlug(slug);
  const review = w ? readReview(slug) : null;
  const body = w ? readWorkBody(w) : null;
  if (!w || !review || !body) notFound();
  const collection = collectionBySlug(w.collection);
  return (
    <SiteShell>
      <Link href={`/work/${w.slug}`} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">
        <ArrowLeft className="h-4 w-4" /> {w.title} — review mode
      </Link>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        <aside className="lg:sticky lg:top-8 rounded-lg border border-rule bg-card shadow-card p-6">
          <p className="text-xs text-muted mb-2">{[w.date ? longDate(w.date) : w.year, w.venue].filter(Boolean).join(' · ')}</p>
          <h1 className="font-serif text-3xl leading-tight" style={{ fontWeight: 620 }}>{w.title}</h1>
          {w.subtitle && <p className="font-serif text-xl text-muted mt-2 leading-snug">{w.subtitle}</p>}
          {w.blurb && <p className="text-sm leading-relaxed text-ink/85 mt-4">{w.blurb}</p>}
          <Link href={`/work/${w.slug}`} className="mt-5 flex items-start gap-2.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 no-underline hover:bg-accent/20 transition-colors">
            <Columns className="h-4 w-4 mt-0.5 shrink-0 text-accent-ink" />
            <span className="text-sm leading-snug text-ink"><span style={{ fontWeight: 600 }}>Review mode</span> — the book beside the pages it cites. Every citation below is a link into it.</span>
          </Link>
          {collection && <p className="text-xs text-muted mt-4">Part of <Link href={`/work#${collection.slug}`} className="text-accent-ink underline">{collection.title}</Link></p>}
        </aside>
        <section className="min-w-0">
          <ArticleBody citeBase={`/work/${w.slug}`}>{body}</ArticleBody>
        </section>
      </div>
    </SiteShell>
  );
}
