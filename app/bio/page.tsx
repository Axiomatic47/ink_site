import type { Metadata } from 'next';
import { cv } from '@/lib/cv';
import { readBio } from '@/lib/bio.server';
import { SiteShell } from '../_components/SiteShell';
import { InfoCard } from '../_components/InfoCard';
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
        <InfoCard />
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
