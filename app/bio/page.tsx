import type { Metadata } from 'next';
import { cv } from '@/lib/cv';
import { readBio } from '@/lib/bio.server';
import { SiteShell } from '../_components/SiteShell';
import { InfoCard } from '../_components/InfoCard';
import { ArticleBody } from '../_components/ArticleBody';
import { PdfViewer } from '../_components/PdfViewer';

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
        <InfoCard link={{ href: '#curriculum-vitae', label: 'Curriculum vitae' }} />
        <section className="min-w-0">
          <header className="mb-6">
            <p className="text-muted text-lg mb-1">{bio?.title ?? 'Biography'}</p>
            <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>{cv.name}</h1>
            {bio?.updated && <p className="text-sm text-muted mt-3">Updated {longDate(bio.updated)}</p>}
          </header>
          {bio ? <ArticleBody>{bio.body}</ArticleBody> : <p className="text-muted">The biography is being written.</p>}
          {/* the résumé, under the biography (owner 2026-10-11; the home page shows the open letter) */}
          {cv.pdf ? (
            <section id="curriculum-vitae" aria-label="Curriculum vitae" className="mt-12 scroll-mt-8">
              <h2 className="font-serif text-2xl mb-4" style={{ fontWeight: 560 }}>Curriculum vitae</h2>
              <PdfViewer src={cv.pdf} title={cv.name} downloadName={cv.pdf.split('/').pop()} toolbar="bottom" />
            </section>
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
