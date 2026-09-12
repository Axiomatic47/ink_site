import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { works, workBySlug } from '@/lib/works';
import { SiteShell } from '../../_components/SiteShell';
import { PdfViewer } from '../../_components/PdfViewer';

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

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const w = workBySlug((await params).slug);
  if (!w) notFound();
  const i = works.findIndex((x) => x.slug === w.slug);
  const prev = works[i - 1], next = works[i + 1];
  return (
    <SiteShell>
      <Link href="/work" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">
        <ArrowLeft className="h-4 w-4" /> All work
      </Link>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        <aside className="lg:sticky lg:top-8 rounded-lg border border-rule bg-card shadow-card p-6">
          <p className="text-xs text-muted mb-2">{[w.year, w.venue].filter(Boolean).join(' · ')}</p>
          <h1 className="font-serif text-3xl leading-tight" style={{ fontWeight: 620 }}>{w.title}</h1>
          {w.subtitle && <p className="font-serif text-xl text-muted mt-2 leading-snug">{w.subtitle}</p>}
          {w.blurb && <p className="text-sm leading-relaxed text-ink/85 mt-4">{w.blurb}</p>}
          <nav aria-label="Other pieces" className="mt-6 pt-4 border-t border-rule flex justify-between gap-3 text-sm">
            {prev ? <Link href={`/work/${prev.slug}`} className="text-muted hover:text-ink no-underline">← {prev.title}</Link> : <span />}
            {next ? <Link href={`/work/${next.slug}`} className="text-muted hover:text-ink no-underline text-right">{next.title} →</Link> : <span />}
          </nav>
        </aside>
        <section className="min-w-0">
          <PdfViewer src={w.pdf} title={w.title} downloadName={w.pdf.split('/').pop()} />
        </section>
      </div>
    </SiteShell>
  );
}
