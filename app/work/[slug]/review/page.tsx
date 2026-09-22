// /work/<slug>/review — REVIEW MODE for a book published with its cited pages:
// the text in one pane, the page each citation pins in the other (owner
// 2026-09-14: "a dual viewer like we do for the STAC/HLS images … links over
// the citations that bring up the pinned page"). The book is rendered here on
// the server (react-markdown over 800 KB of text is a build-time cost, not a
// visitor's); ReviewBody adds the panes and the click handling around it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { workBySlug } from '@/lib/works';
import { ogImages } from '@/lib/og.server';
import { readWorkBody } from '@/lib/works.server';
import { editionLeaves, readReview, reviewSlugs } from '@/lib/review.server';
import { reviewMeta } from '@/lib/review';
import { ArticleBody } from '../../../_components/ArticleBody';
import { ReviewLoader } from './ReviewLoader';

export const dynamicParams = false;
export function generateStaticParams() {
  return reviewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = workBySlug((await params).slug);
  if (!w) return {};
  const title = `${w.title} — review mode`, description = `${w.title}: the text beside the pages it cites, one citation at a time.`;
  const og = ogImages(`work-${w.slug}`, `${w.title} — the first page`); // the work's card (scripts/build_og_images.py)
  return {
    title, description, alternates: { canonical: `/work/${w.slug}/review` },
    openGraph: { title, description, type: 'article', url: `/work/${w.slug}/review`, ...og.openGraph },
    twitter: og.twitter,
  };
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = workBySlug(slug);
  const manifest = w ? readReview(slug) : null;
  const body = w ? readWorkBody(w) : null;
  if (!w || !manifest || !body) notFound();
  return (
    <ReviewLoader work={{ slug: w.slug, title: w.title, subtitle: w.subtitle, venue: w.venue }} meta={reviewMeta(manifest)} textHref={`/work/${w.slug}/text`} editions={editionLeaves()} backHref={`/work#${w.collection}`} backLabel="Articles">
      {manifest.pdf ? undefined : <ArticleBody bare citeBase="">{body}</ArticleBody>}
    </ReviewLoader>
  );
}
