import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { works, workBySlug, collectionBySlug, worksIn } from '@/lib/works';
import { readWorkBody } from '@/lib/works.server';
import { SiteShell } from '../../_components/SiteShell';
import { PdfViewer } from '../../_components/PdfViewer';
import { ArticleBody } from '../../_components/ArticleBody';

export const dynamicParams = false;
export function generateStaticParams() {
  return works.map((w) => ({ slug: w.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const w = workBySlug((await params).slug);
  if (!w) return {};
  return {
    title: w.title,
    description: w.blurb ?? w.subtitle ?? w.title,
    alternates: { canonical: `/work/${w.slug}` },
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
            <ArticleBody>{body}</ArticleBody>
          ) : (
            <p className="text-muted">This article is not yet available in the reader.</p>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
