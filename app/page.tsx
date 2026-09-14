import type { Metadata } from 'next';
import Link from 'next/link';
import { cv } from '@/lib/cv';
import { SiteShell } from './_components/SiteShell';
import { InfoCard } from './_components/InfoCard';
import { PdfViewer } from './_components/PdfViewer';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function About() {
  return (
    <SiteShell>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        {/* left column: portrait + general information */}
        <InfoCard />

        {/* right column: headline, name, CV viewer */}
        <section className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              {cv.headline && <p className="text-muted text-lg sm:text-xl mb-1">{cv.headline}</p>}
              <h1 className="font-serif text-4xl sm:text-5xl xl:text-6xl leading-none tracking-tight" style={{ fontWeight: 620 }}>
                {cv.name}
              </h1>
            </div>
            {cv.availability && (
              <span className="inline-flex items-center h-10 px-4 rounded-md bg-ink-2 text-on-ink text-sm border-l-4 border-accent">
                {cv.availability}
              </span>
            )}
          </div>

          {cv.summary && <p className="font-serif text-lg leading-relaxed text-ink/90 max-w-3xl mb-3">{cv.summary}</p>}
          <p className="text-sm mb-8"><Link href="/bio" className="text-accent-ink underline">Read the biography</Link></p>

          {cv.pdf ? (
            <PdfViewer src={cv.pdf} title={cv.name} downloadName={cv.pdf.split('/').pop()} />
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
