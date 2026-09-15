// ArchivesShelf — the two manuscript archives as thumbnail cards below the CV
// on the home page, with the Prynne epigraph BENEATH the cards, above the
// footer (owner 2026-09-15) (owner 2026-09-14: "the from
// the archives manuscript thumbnail links with the quote below my resume like
// we have on my loe site"). Server component: reads each archive manifest at
// build time for the first-leaf thumbnail and the leaf count. Card facts come
// from RESEARCH_ARCHIVES (src/lib/research-archive.ts), never from here.
import Link from 'next/link';
import { ArrowRight, ScrollText } from 'lucide-react';
import { ARCHIVE_IDS, RESEARCH_ARCHIVES, archiveBase } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { Md } from './Markdown';

export function ArchivesShelf() {
  return (
    <div className="mt-16">
      <section aria-labelledby="from-the-archives">
        <p id="from-the-archives" className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>From the archives</p>
        <ul className="grid gap-4 md:grid-cols-2">
          {ARCHIVE_IDS.map((id) => {
            const c = RESEARCH_ARCHIVES[id];
            const m = readArchiveManifest(id);
            const first = m?.leaves[0];
            const thumb = first ? `${archiveBase(id)}/${first.thumb ?? first.image}` : null;
            const leaves = m?.leaves.length ?? 0;
            return (
              <li key={id}>
                <Link href={`/research/${id}`} className="group flex h-full flex-col rounded-lg border border-rule bg-card shadow-card p-5 no-underline hover:border-accent transition-colors">
                  <div className="flex items-start gap-3">
                    <ScrollText className="h-5 w-5 text-accent mt-1 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <h2 className="font-serif text-lg leading-snug text-ink group-hover:text-accent-ink" style={{ fontWeight: 580 }}>
                        <Md inline>{c.caseTitle}</Md>
                      </h2>
                      <p className="text-xs text-muted mt-1 tabular-nums">
                        {c.ref}
                        <br />
                        {c.shelf.holder} · {c.dated.split(' · ')[0]}
                      </p>
                    </div>
                  </div>
                  {thumb && (
                    <div className="mt-4 rounded-md border border-rule overflow-hidden bg-well">
                      {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
                      <img src={thumb} alt={`${c.ref} — first leaf`} loading="lazy" className="w-full h-44 object-cover object-top group-hover:opacity-90 transition-opacity" />
                    </div>
                  )}
                  <p className="text-sm leading-relaxed text-ink/85 mt-3 flex-grow">{c.shelf.blurb}</p>
                  <p className="text-sm text-accent-ink mt-4 inline-flex items-center" style={{ fontWeight: 500 }}>
                    Read the manuscript{leaves > 0 ? ` (${leaves} leaves)` : ''}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <figure className="text-center px-4 max-w-3xl mx-auto mt-14">
        <blockquote>
          <p className="font-serif italic text-ink/90 text-xl sm:text-2xl leading-snug">
            “how unsafe it is to take Records upon trust, from the reports of learned Judges, who never read nor perused their originals.”
          </p>
        </blockquote>
        <figcaption className="text-sm text-muted mt-4">— William Prynne (1669), Keeper of His Majesties Records in the Tower of London</figcaption>
      </figure>
    </div>
  );
}
