// app/research/immunity-timeline/page.tsx — the actual history of immunity, in all its categories, set beside the
// six-step origin story at endqi.org (owner's word 2026-10-06; shared with Campaign Zero as a proposed correction to
// their timeline). The content is public/research/immunity-timeline.json, the drafters' reviewed work (every fact from
// the book or a shelf copy; src/lib/immunity-timeline.ts is the shape, scripts/validate-timeline.mjs the gate). This page
// renders it and adds nothing: the comparison first, their step beside the record, then the record in order with a
// category filter, every entry anchored and linked to its note in the book. No content → 404; the route exists only when
// the reviewed content does.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteShell } from '../../_components/SiteShell';
import { Md } from '../../_components/Markdown';
import { Eyebrow } from '../_readings/ui';
import { loadImmunityTimeline } from '@/lib/immunity-timeline.server';
import { CATEGORY_LABEL, TIMELINE_PAGE_PATH, TIMELINE_PUBLIC_PATH, yearLabel } from '@/lib/immunity-timeline';
import { TimelineRail } from './TimelineFilter';
import './timeline.css';

export function generateMetadata(): Metadata {
  const t = loadImmunityTimeline();
  if (!t) return { title: 'Immunity timeline', robots: { index: false, follow: false } };
  return {
    title: t.title,
    description: t.standfirst.replace(/[*_`]/g, '').slice(0, 300),
    alternates: { canonical: TIMELINE_PAGE_PATH },
  };
}

export default function ImmunityTimelinePage() {
  const t = loadImmunityTimeline();
  if (!t || t.entries.length === 0) notFound();
  const byId = new Map(t.entries.map((e) => [e.id, e]));
  const first = t.entries[0];
  const last = t.entries[t.entries.length - 1];
  const bookHref = `/work/${t.provenance.book_slug}`;
  const commit = t.provenance.book_commit ? t.provenance.book_commit.slice(0, 8) : null;

  return (
    <SiteShell>
      <Link href="/research" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">← Research</Link>
      <div className="max-w-5xl tl-page">
        <header className="max-w-3xl">
          <Eyebrow>Research · a timeline</Eyebrow>
          <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>{t.title}</h1>
          <div className="font-serif text-lg leading-relaxed text-ink/90 mt-5 tl-standfirst"><Md>{t.standfirst}</Md></div>
          <p className="mt-5 text-sm text-muted leading-relaxed">
            {t.entries.length} entries, {yearLabel(first)} to {yearLabel(last)}. Every entry rests on{' '}
            <Link href={bookHref} className="underline hover:text-ink"><em>{t.provenance.book_title}</em></Link>
            {commit ? <> (the text at {commit})</> : null} or on a copy of the source held in the library; the pin names where it was read.
            {' '}Read on {t.provenance.date}.{' '}
            <a href={TIMELINE_PUBLIC_PATH} className="underline hover:text-ink">The data as a file (JSON)</a>.
          </p>
        </header>

        {t.comparison && t.comparison.length > 0 && (
          <section className="mt-14" aria-labelledby="beside">
            <Eyebrow>Beside the endqi.org timeline</Eyebrow>
            <h2 id="beside" className="font-serif text-2xl leading-tight" style={{ fontWeight: 560 }}>Their six steps, and what the record says</h2>
            {t.comparison_line && <div className="mt-3 max-w-3xl leading-relaxed text-ink/90 tl-prose"><Md>{t.comparison_line}</Md></div>}
            {t.endqi && (
              <p className="mt-3 text-sm text-muted">
                As printed at <a href={t.endqi.url} className="underline hover:text-ink" rel="noopener">{t.endqi.url.replace(/^https?:\/\//, '')}</a>, read on {t.endqi.read_on}
                {t.endqi.heading ? <>, under &ldquo;{t.endqi.heading}&rdquo;</> : null}.
                {t.endqi.standfirst ? <> Its standfirst: &ldquo;{t.endqi.standfirst}&rdquo;</> : null}
              </p>
            )}
            <ol className="mt-8 grid gap-6 list-none p-0 m-0">
              {t.comparison.slice().sort((a, b) => a.step - b.step).map((s) => (
                <li key={s.step} className="grid gap-4 md:grid-cols-2 tl-step">
                  <div className="bg-well border border-rule rounded-lg p-5 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.14em] text-muted" style={{ fontWeight: 600 }}>endqi.org · step {s.step} · {s.label}</span>
                      {s.their_date_text && <span className="text-sm text-muted">{s.their_date_text}</span>}
                    </div>
                    <h3 className="font-serif text-xl mt-2 leading-snug" style={{ fontWeight: 560 }}>{s.their_title}</h3>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/80">&ldquo;{s.their_claim}&rdquo;</p>
                  </div>
                  <div className="bg-card border border-rule rounded-lg shadow-card p-5 min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-accent-ink" style={{ fontWeight: 600 }}>What the record says</p>
                    <div className="mt-2 leading-relaxed tl-prose"><Md>{s.correction}</Md></div>
                    {s.entry_ids.length > 0 && (
                      <p className="mt-3 text-sm text-muted">
                        In the record:{' '}
                        {s.entry_ids.map((id, i) => {
                          const e = byId.get(id);
                          return (
                            <span key={id}>
                              {i > 0 ? ' · ' : ''}
                              <a href={`#${id}`} className="underline hover:text-ink">{e ? `${yearLabel(e)} ${e.title}` : id}</a>
                            </span>
                          );
                        })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-14" aria-labelledby="record">
          <Eyebrow>The record, in order</Eyebrow>
          <h2 id="record" className="font-serif text-2xl leading-tight" style={{ fontWeight: 560 }}>The history of immunity, {yearLabel(first)} to {yearLabel(last)}</h2>
          <p className="mt-3 max-w-3xl text-sm text-muted leading-relaxed">
            Each entry names its category, its source and the page it was read at, and the section and note of the book it rests on. The
            categories can be shown or hidden; printing shows them all.
          </p>
          <TimelineRail entries={t.entries} bookSlug={t.provenance.book_slug} />
        </section>

        <footer className="mt-14 max-w-3xl text-sm text-muted leading-relaxed border-t border-rule pt-6">
          <p>
            Categories: {Object.values(CATEGORY_LABEL).join(' · ')}. A correction to any entry is welcome through the{' '}
            <Link href="/contact" className="underline hover:text-ink">contact page</Link>; name the entry and the page you read.
          </p>
        </footer>
      </div>
    </SiteShell>
  );
}
