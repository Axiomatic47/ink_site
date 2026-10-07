// app/research/immunity-timeline/TimelineBody.tsx — the timeline page's body: the one file every site renders the same.
// It takes the loaded data and draws the header block, the comparison with endqi.org's steps, the record on its rail and
// the closing note; the site around it (its shell, head and back link) is each site's page.tsx. This file is byte-identical
// on kirchner.ink, kirchnervjohnson.com and lawsofexistence.com — a change lands on all three, and the page adds nothing
// to the data it is given (src/lib/immunity-timeline.ts is the shape; scripts/validate-timeline.mjs the gate).
import { Md } from '../../_components/Markdown';
import { CATEGORY_LABEL, TIMELINE_PUBLIC_PATH, yearLabel, type ImmunityTimeline } from '@/lib/immunity-timeline';
import { TimelineRail } from './TimelineFilter';

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>{children}</div>
);

export function TimelineBody({ t, bookBase, contactHref }: { t: ImmunityTimeline; bookBase: string; contactHref?: string }) {
  const byId = new Map(t.entries.map((e) => [e.id, e]));
  const first = t.entries[0];
  const last = t.entries[t.entries.length - 1];
  const commit = t.provenance.book_commit ? t.provenance.book_commit.slice(0, 8) : null;
  const steps = (t.comparison ?? []).slice().sort((a, b) => a.step - b.step);

  return (
    <div className="max-w-5xl tl-page">
      <header className="max-w-3xl">
        <Eyebrow>Research · a timeline</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>{t.title}</h1>
        <div className="font-serif text-lg leading-relaxed text-ink/90 mt-5 tl-standfirst"><Md>{t.standfirst}</Md></div>
        <p className="mt-5 text-sm text-muted leading-relaxed">
          {t.entries.length} entries, {yearLabel(first)} to {yearLabel(last)}. Every entry rests on{' '}
          <a href={bookBase} className="underline hover:text-ink"><em>{t.provenance.book_title}</em></a>
          {commit ? <> (the text at {commit})</> : null} or on a copy of the source held in the library; the pin names where it was read.
          {' '}Read on {t.provenance.date}.{' '}
          <a href={TIMELINE_PUBLIC_PATH} className="underline hover:text-ink">The data as a file (JSON)</a>.
        </p>
      </header>

      {steps.length > 0 && (
        <section className="mt-14" aria-labelledby="beside">
          <Eyebrow>Beside the endqi.org timeline</Eyebrow>
          <h2 id="beside" className="font-serif text-2xl leading-tight" style={{ fontWeight: 560 }}>Their {steps.length === 6 ? 'six' : steps.length} steps, and what the record says</h2>
          {t.comparison_line && <div className="mt-3 max-w-3xl leading-relaxed text-ink/90 tl-prose"><Md>{t.comparison_line}</Md></div>}
          {t.endqi && (
            <p className="mt-3 text-sm text-muted">
              As printed at <a href={t.endqi.url} className="underline hover:text-ink" rel="noopener">{t.endqi.url.replace(/^https?:\/\//, '')}</a>, read on {t.endqi.read_on}
              {t.endqi.heading ? <>, under &ldquo;{t.endqi.heading}&rdquo;</> : null}.
              {t.endqi.standfirst ? <> Its standfirst: &ldquo;{t.endqi.standfirst}&rdquo;</> : null}
            </p>
          )}
          <ol className="mt-8 grid gap-6 list-none p-0 m-0">
            {steps.map((s) => (
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
        <TimelineRail entries={t.entries} bookBase={bookBase} />
      </section>

      <footer className="mt-14 max-w-3xl text-sm text-muted leading-relaxed border-t border-rule pt-6">
        <p>
          Categories: {Object.values(CATEGORY_LABEL).join(' · ')}. A correction to any entry is welcome
          {contactHref ? <> through the <a href={contactHref} className="underline hover:text-ink">contact page</a></> : null}; name the entry and the page you read.
        </p>
      </footer>
    </div>
  );
}
