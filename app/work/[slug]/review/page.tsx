// /work/<slug>/review — REVIEW MODE for a book published with its cited pages:
// the text in one pane, the page each citation pins in the other (owner
// 2026-09-14: "a dual viewer like we do for the STAC/HLS images … links over
// the citations that bring up the pinned page"). The book is rendered here on
// the server (react-markdown over 800 KB of text is a build-time cost, not a
// visitor's); ReviewBody adds the panes and the click handling around it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { workBySlug } from '@/lib/works';
import { readWorkBody } from '@/lib/works.server';
import { readReview, reviewSlugs } from '@/lib/review.server';
import { publishedUnits } from '@/lib/review';
import { ArticleBody } from '../../../_components/ArticleBody';
import { ReviewBody } from './ReviewBody';

export const dynamicParams = false;
export function generateStaticParams() {
  return reviewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = workBySlug((await params).slug);
  if (!w) return {};
  return {
    title: `${w.title} — review mode`,
    description: `${w.title}: the text beside the pages it cites, one citation at a time.`,
    alternates: { canonical: `/work/${w.slug}/review` },
  };
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = workBySlug(slug);
  const manifest = w ? readReview(slug) : null;
  const body = w ? readWorkBody(w) : null;
  if (!w || !manifest || !body) notFound();
  return (
    <ReviewBody work={{ slug: w.slug, title: w.title, subtitle: w.subtitle, venue: w.venue }} manifest={manifest} published={publishedUnits(manifest).length} textHref={`/work/${w.slug}/text`} backHref={`/work#${w.collection}`} backLabel="Articles">
      <ArticleBody bare citeBase="">{body}</ArticleBody>
    </ReviewBody>
  );
}
