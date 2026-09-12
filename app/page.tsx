import type { Metadata } from 'next';
import { Mail, MapPin, Link as LinkIcon } from 'lucide-react';
import { cv } from '@/lib/cv';
import { SiteShell } from './_components/SiteShell';
import { Portrait } from './_components/Portrait';
import { PdfViewer } from './_components/PdfViewer';
import { DownloadCvMenu } from './_components/DownloadCvMenu';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function About() {
  return (
    <SiteShell>
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr] xl:grid-cols-[21rem_1fr] items-start">
        {/* left column: portrait + general information */}
        <aside className="lg:sticky lg:top-8 space-y-0 rounded-lg overflow-hidden shadow-card border border-rule">
          <Portrait />
          <div className="bg-ink text-on-ink p-6">
            <h2 className="font-serif text-2xl mb-4" style={{ fontWeight: 560 }}>General information</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex gap-3">
                <dt className="sr-only">Name</dt>
                <span className="w-4 text-accent font-serif">·</span>
                <dd><span className="text-on-ink/60">Name: </span>{cv.name}</dd>
              </div>
              {cv.location && (
                <div className="flex gap-3">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
                  <dd><span className="text-on-ink/60">Location: </span>{cv.location}</dd>
                </div>
              )}
              <div className="flex gap-3">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
                <dd><span className="text-on-ink/60">Email: </span><a href={`mailto:${cv.email}`} className="hover:text-white">{cv.email}</a></dd>
              </div>
              {cv.links.map((l) => (
                <div key={l.url} className="flex gap-3">
                  <LinkIcon className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden />
                  <dd><a href={l.url} rel="me noopener" className="hover:text-white">{l.label}</a></dd>
                </div>
              ))}
            </dl>
            {cv.pdf && <DownloadCvMenu styled={cv.pdf} print={cv.pdf_print || undefined} className="mt-6" />}
          </div>
        </aside>

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

          {cv.summary && <p className="font-serif text-lg leading-relaxed text-ink/90 max-w-3xl mb-8">{cv.summary}</p>}

          {cv.pdf ? (
            <PdfViewer src={cv.pdf} title={cv.name} downloadName={cv.pdf.split('/').pop()} />
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
