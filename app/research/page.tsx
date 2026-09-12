import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {ARCHIVE_IDS, RESEARCH_ARCHIVES, archiveBase } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { loadAllReadings } from '@/lib/open-readings.server';
import { SiteShell } from '../_components/SiteShell';
import { Md } from '../_components/Markdown';

export const metadata: Metadata = {
  title: 'Research',
  description: 'Primary-source research archives: first-hand diplomatic transcriptions of Star Chamber manuscripts of 1607, with leaf images, line indexes, and working papers.',
  alternates: { canonical: '/research' },
};

export default function ResearchIndex() {
  const readings = loadAllReadings();
  const readingCount = readings.reduce((n, c) => n + c.items.length, 0);
  const openCount = readings.reduce((n, c) => n + c.items.filter((i) => i.status === 'open').length, 0);
  return (
    <SiteShell>
      <header className="mb-10 max-w-3xl">
        <p className="text-muted text-lg mb-1">Research</p>
        <h1 className="font-serif text-4xl sm:text-5xl tracking-tight" style={{ fontWeight: 620 }}>Primary-source archives</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed text-ink/90">
          First-hand diplomatic transcriptions of two manuscript witnesses to <em>Floyd v. Barker</em> (Star Chamber, 1607):
          the leaf images beside their line indexes and transcripts, with every reading marked provisional and every
          image hash-recorded.
        </p>
      </header>
      <ul className="grid gap-6 lg:grid-cols-2">
        {ARCHIVE_IDS.map((id) => {
          const c = RESEARCH_ARCHIVES[id];
          const m = readArchiveManifest(id);
          const first = m?.leaves[0];
          return (
            <li key={id}>
              <Link href={`/research/${id}`} className="group flex h-full rounded-lg border border-rule bg-card shadow-card overflow-hidden no-underline hover:border-accent transition-colors">
                {first && (
                  <div className="w-36 sm:w-44 shrink-0 bg-well overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
                    <img src={`${archiveBase(id)}/${first.thumb ?? first.image}`} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                  </div>
                )}
                <div className="p-6 min-w-0">
                  <p className="text-xs text-muted mb-2">{c.dated}</p>
                  <h2 className="font-serif text-2xl leading-snug group-hover:text-accent-ink" style={{ fontWeight: 560 }}>
                    {c.ref} — <Md inline>{c.caseTitle}</Md>
                  </h2>
                  <p className="text-sm leading-relaxed text-ink/80 mt-3">{c.summary}</p>
                  <p className="text-sm text-muted mt-3">
                    {m ? `${m.leaves.length} ${c.leafLabel.toLowerCase()}s · ${m.workingPapers.length} working papers` : ''}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm text-accent-ink">Open the archive <ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {readingCount > 0 && (
        <section className="mt-12">
          <p className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>Readings for review</p>
          <Link href="/research/open-readings" className="group flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rule bg-ink text-on-ink shadow-card p-6 no-underline hover:bg-ink-2 transition-colors">
            <div className="min-w-0">
              <h2 className="font-serif text-2xl leading-snug" style={{ fontWeight: 560 }}>Open Readings</h2>
              <p className="text-sm text-on-ink/80 mt-2 max-w-2xl">
                Disputed manuscript readings set out for qualified readers: the detail enlarged, our transcription beside the comparison edition, one question, and an answer form.
              </p>
            </div>
            <span className="text-sm text-accent inline-flex items-center gap-1 shrink-0">{readingCount} reading{readingCount === 1 ? '' : 's'} · {openCount} open <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </section>
      )}
    </SiteShell>
  );
}
