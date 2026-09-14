import type { Metadata } from 'next';
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
        <InfoCard link={{ href: '/bio', label: 'Read the biography' }} />

        {/* right column: the CV viewer takes the main space (owner 2026-09-14) */}
        <section className="min-w-0">
          <h1 className="sr-only">{cv.name}</h1>

          {cv.pdf ? (
            <PdfViewer src={cv.pdf} title={cv.name} downloadName={cv.pdf.split('/').pop()} resizable />
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
