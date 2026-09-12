import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Mail, BookOpen, FileText } from 'lucide-react';
import { cv } from '@/lib/cv';
import { readBio } from '@/lib/bio.server';
import { SiteShell } from '../_components/SiteShell';
import { Portrait } from '../_components/Portrait';
import { ArticleBody } from '../_components/ArticleBody';

export const metadata: Metadata = {
  title: 'Biography',
  description: `${cv.name}: education, independent study, research, and work.`,
  alternates: { canonical: '/bio' },
};

const longDate = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '');

export default function BioPage() {
  const bio = readBio();
  return (
    <SiteShell>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        <aside className="lg:sticky lg:top-8 rounded-lg overflow-hidden shadow-card border border-rule">
          <Portrait />
          <div className="bg-ink text-on-ink p-6">
            <p className="font-serif text-2xl" style={{ fontWeight: 560 }}>{cv.name}</p>
            {cv.headline && <p className="text-sm text-on-ink/70 mt-1">{cv.headline}</p>}
            <dl className="mt-5 space-y-3 text-sm">
              {cv.location && (
                <div className="flex gap-3"><MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden /><dd>{cv.location}</dd></div>
              )}
              <div className="flex gap-3"><Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden /><dd><a href={`mailto:${cv.email}`} className="hover:text-white">{cv.email}</a></dd></div>
            </dl>
            {cv.education.length > 0 && (
              <>
                <h2 className="mt-6 text-xs uppercase tracking-[0.12em] text-on-ink/60">Education</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {[...cv.education].reverse().map((e) => (
                    <li key={`${e.institution}-${e.year}`}>
                      <span className="block">{e.degree || e.institution}</span>
                      <span className="block text-on-ink/60">{[e.degree ? e.institution : null, e.year].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-6 grid gap-2 text-sm">
              <Link href="/work" className="inline-flex items-center gap-2 no-underline hover:text-white"><BookOpen className="h-4 w-4 text-accent" aria-hidden /> Articles</Link>
              <Link href="/" className="inline-flex items-center gap-2 no-underline hover:text-white"><FileText className="h-4 w-4 text-accent" aria-hidden /> Curriculum vitae</Link>
            </div>
          </div>
        </aside>
        <section className="min-w-0">
          <header className="mb-6">
            <p className="text-muted text-lg mb-1">{bio?.title ?? 'Biography'}</p>
            <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>{cv.name}</h1>
            {bio?.updated && <p className="text-sm text-muted mt-3">Updated {longDate(bio.updated)}</p>}
          </header>
          {bio ? <ArticleBody>{bio.body}</ArticleBody> : <p className="text-muted">The biography is being written.</p>}
        </section>
      </div>
    </SiteShell>
  );
}
