import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, AlignLeft } from 'lucide-react';
import { collections, works, worksIn } from '@/lib/works';
import { SiteShell } from '../_components/SiteShell';

export const metadata: Metadata = {
  title: 'Articles',
  description: 'Academic articles and working papers, by collection, presented in the site reader.',
  alternates: { canonical: '/work' },
};

const longDate = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }) : '');

export default function WorkIndex() {
  return (
    <SiteShell>
      <header className="mb-12 max-w-3xl">
        <p className="text-muted text-lg mb-1">Articles</p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>Writing</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed text-ink/90">
          {works.length} articles and working papers in {collections.length} collections. Each opens in the reader; papers issued as PDF carry download and full-window options.
        </p>
        <nav aria-label="Collections" className="mt-6 flex flex-wrap gap-2 text-sm">
          {collections.map((c) => (
            <a key={c.slug} href={`#${c.slug}`} className="inline-flex items-center min-h-11 lg:min-h-0 rounded-full border border-rule bg-card px-3 py-1 no-underline text-ink/80 hover:border-accent hover:text-ink">
              {c.title} <span className="text-muted">· {worksIn(c.slug).length}</span>
            </a>
          ))}
        </nav>
      </header>

      {collections.map((c) => {
        const items = worksIn(c.slug);
        if (!items.length) return null;
        return (
          <section key={c.slug} id={c.slug} className="mb-14 scroll-mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-3 mb-6">
              <h2 className="font-serif text-2xl sm:text-3xl leading-tight" style={{ fontWeight: 600 }}>{c.title}</h2>
              <p className="text-sm text-muted">{items.length} {items.length === 1 ? 'article' : 'articles'}{c.date ? ` · ${longDate(c.date)}` : ''}</p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((w) => (
                <li key={w.slug}>
                  <Link href={`/work/${w.slug}`} className="group block h-full rounded-lg border border-rule bg-card shadow-card p-6 no-underline hover:border-accent transition-colors">
                    <div className="flex items-center gap-2 text-xs text-muted mb-3">
                      {w.pdf ? <FileText className="h-3.5 w-3.5 text-accent" aria-hidden /> : <AlignLeft className="h-3.5 w-3.5 text-accent" aria-hidden />}
                      <span>{[w.date ? longDate(w.date) : w.year, w.pdf ? 'PDF' : 'Text'].filter(Boolean).join(' · ')}</span>
                    </div>
                    <h3 className="font-serif text-xl leading-snug group-hover:text-accent-ink" style={{ fontWeight: 560 }}>{w.title}</h3>
                    {w.subtitle && <p className="font-serif text-lg text-muted mt-1 leading-snug">{w.subtitle}</p>}
                    {w.blurb && <p className="text-sm leading-relaxed text-ink/80 mt-3">{w.blurb}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </SiteShell>
  );
}
