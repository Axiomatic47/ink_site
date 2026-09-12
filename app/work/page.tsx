import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { works } from '@/lib/works';
import { SiteShell } from '../_components/SiteShell';

export const metadata: Metadata = {
  title: 'Selected Work',
  description: 'Selected writing, presented in the site viewer.',
  alternates: { canonical: '/work' },
};

export default function WorkIndex() {
  return (
    <SiteShell>
      <header className="mb-10 max-w-3xl">
        <p className="text-muted text-lg mb-1">Selected work</p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>Writing</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed text-ink/90">
          A selection of published pieces. Each opens in the reader with download and full-window options.
        </p>
      </header>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {works.map((w) => (
          <li key={w.slug}>
            <Link href={`/work/${w.slug}`} className="group block h-full rounded-lg border border-rule bg-card shadow-card p-6 no-underline hover:border-accent transition-colors">
              <div className="flex items-center gap-2 text-xs text-muted mb-3">
                <FileText className="h-3.5 w-3.5 text-accent" aria-hidden />
                <span>{[w.year, w.venue].filter(Boolean).join(' · ')}</span>
              </div>
              <h2 className="font-serif text-2xl leading-snug group-hover:text-accent-ink" style={{ fontWeight: 560 }}>{w.title}</h2>
              {w.subtitle && <p className="font-serif text-lg text-muted mt-1 leading-snug">{w.subtitle}</p>}
              {w.blurb && <p className="text-sm leading-relaxed text-ink/80 mt-3">{w.blurb}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </SiteShell>
  );
}
