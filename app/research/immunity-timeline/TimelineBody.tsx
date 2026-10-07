// app/research/immunity-timeline/TimelineBody.tsx — the timeline page's body: the one file every site renders the same.
// It takes the loaded data and draws the header block, the key, the record on its rail and the closing note; the site
// around it (its shell, head and back link) is each site's page.tsx. This file is byte-identical on kirchner.ink,
// kirchnervjohnson.com and lawsofexistence.com — a change lands on all three, and the page adds nothing to the data it is
// given (src/lib/immunity-timeline.ts is the shape; scripts/validate-timeline.mjs the gate). The timeline is shared outward
// as the record; it is not set beside anyone else's, so a comparison block in the data is not drawn.
import { Md } from '../../_components/Markdown';
import { BOOK_SHORT, CATEGORY_LABEL, KIND_LABEL, TIMELINE_PUBLIC_PATH, yearLabel, type ImmunityTimeline } from '@/lib/immunity-timeline';
import { TimelineRail } from './TimelineFilter';

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>{children}</div>
);

export function TimelineBody({ t, bookBase, contactHref }: { t: ImmunityTimeline; bookBase: string; contactHref?: string }) {
  const first = t.entries[0];
  const last = t.entries[t.entries.length - 1];
  const commit = t.provenance.book_commit ? t.provenance.book_commit.slice(0, 8) : null;

  return (
    <div className="max-w-5xl tl-page">
      <header className="max-w-3xl">
        <Eyebrow>Research · a timeline</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>{t.title}</h1>
        <div className="font-serif text-lg leading-relaxed text-ink/90 mt-5 tl-standfirst"><Md>{t.standfirst}</Md></div>
        <p className="mt-5 text-sm text-muted leading-relaxed">
          {t.entries.length} entries, {yearLabel(first)} to {yearLabel(last)}. Every entry rests on{' '}
          <a href={bookBase} className="underline hover:text-ink"><em>{t.provenance.book_title}</em></a>
          {' '}({BOOK_SHORT}{commit ? <>; the text at {commit}</> : null}) or on a copy of the source held in the library; the pin names where it was read.
          {' '}Read on {t.provenance.date}.{' '}
          <a href={TIMELINE_PUBLIC_PATH} className="underline hover:text-ink">The data as a file (JSON)</a>.
        </p>
      </header>

      <section className="mt-14" aria-labelledby="record">
        <Eyebrow>The record, in order</Eyebrow>
        <h2 id="record" className="font-serif text-2xl leading-tight" style={{ fontWeight: 560 }}>The history of immunity, {yearLabel(first)} to {yearLabel(last)}</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted leading-relaxed">
          Each entry names its type and its category, its source and the page it was read at, and the section and note of {BOOK_SHORT} it
          rests on. A citation opens {BOOK_SHORT} at the passage that cites it, with the cited page beside it; a note opens the note on the
          text page. Types and categories can be shown or hidden; printing shows them all.
        </p>
        <p className="tl-key mt-3 max-w-3xl text-sm text-muted leading-relaxed">
          <span className="text-ink/80">Key:</span> {BOOK_SHORT} = <a href={bookBase} className="underline hover:text-ink"><em>{t.provenance.book_title}</em></a>, the book;
          {' '}§ = its section; n. = its note.
        </p>
        <TimelineRail entries={t.entries} bookBase={bookBase} />
      </section>

      <footer className="mt-14 max-w-3xl text-sm text-muted leading-relaxed border-t border-rule pt-6">
        <p>
          Types: {Object.values(KIND_LABEL).join(' · ')}. Categories: {Object.values(CATEGORY_LABEL).join(' · ')}. A correction to any entry is welcome
          {contactHref ? <> through the <a href={contactHref} className="underline hover:text-ink">contact page</a></> : null}; name the entry and the page you read.
        </p>
      </footer>
    </div>
  );
}
