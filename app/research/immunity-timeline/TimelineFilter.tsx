'use client';
// app/research/immunity-timeline/TimelineFilter.tsx — the rail of entries with a category filter. Every entry is in the
// HTML at build (the filter only sets data-off, so a hidden entry still prints and still answers its #anchor), and without
// script the rail shows everything. Nothing here adds to the content: the words are the data's.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Md } from '../../_components/Markdown';
import { CATEGORIES, CATEGORY_LABEL, bookNoteHref, eraOf, yearLabel, type Category, type TimelineEntry } from '@/lib/immunity-timeline';

export function TimelineRail({ entries, bookSlug }: { entries: TimelineEntry[]; bookSlug: string }) {
  const [off, setOff] = useState<Set<Category>>(() => new Set());
  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const e of entries) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [entries]);
  const present = CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0);
  const shown = entries.filter((e) => !off.has(e.category)).length;
  const toggle = (c: Category) => setOff((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  // the era heading goes above the first entry of each era (the entries arrive sorted)
  const rows = useMemo(() => entries.map((e, i) => ({ e, era: i === 0 || eraOf(entries[i - 1].year) !== eraOf(e.year) ? eraOf(e.year) : null })), [entries]);

  return (
    <>
      <div className="tl-filter mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Show or hide categories">
        {present.map((c) => {
          const on = !off.has(c);
          return (
            <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={on} data-cat={c}
              className={`tl-chip inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] ${on ? 'bg-card border-rule text-ink' : 'bg-transparent border-rule text-muted line-through'}`}>
              <span className="tl-dot" aria-hidden />{CATEGORY_LABEL[c]} <span className="text-muted">{counts.get(c)}</span>
            </button>
          );
        })}
        <span className="text-sm text-muted ml-1">{shown} of {entries.length} shown</span>
        {off.size > 0 && <button type="button" onClick={() => setOff(new Set())} className="text-sm underline text-accent-ink">show all</button>}
      </div>

      <ol className="tl-rail mt-8 list-none p-0 m-0">
        {rows.map(({ e, era }) => {
          return (
            <li key={e.id} className="tl-item" data-cat={e.category} data-off={off.has(e.category) ? '' : undefined}>
              {era && <div className="tl-era text-xs uppercase tracking-[0.14em] text-muted" style={{ fontWeight: 600 }} aria-hidden>{era}</div>}
              <article id={e.id} className="tl-entry">
                <div className="tl-year font-serif text-ink" style={{ fontWeight: 620 }}>
                  <a href={`#${e.id}`} className="no-underline hover:underline">{yearLabel(e)}</a>
                </div>
                <div className="tl-card bg-card border border-rule rounded-lg shadow-card p-5 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{e.date_text}</span>
                    <span className="tl-cat inline-flex items-center gap-1.5 uppercase tracking-[0.1em]" style={{ fontWeight: 600 }}><span className="tl-dot" aria-hidden />{CATEGORY_LABEL[e.category]}</span>
                  </div>
                  <h3 className="font-serif text-xl mt-1.5 leading-snug" style={{ fontWeight: 560 }}>{e.title}</h3>
                  <div className="mt-2 leading-relaxed tl-prose"><Md>{e.summary}</Md></div>
                  {e.quote && (
                    <blockquote className="mt-3 border-l-2 border-accent pl-4 font-serif text-[1.02rem] leading-relaxed text-ink/90">
                      <Md>{e.quote}</Md>
                      {e.quote_pin && <footer className="mt-1 text-xs text-muted not-italic">read at {e.quote_pin}</footer>}
                    </blockquote>
                  )}
                  <p className="mt-3 text-sm text-muted leading-relaxed">
                    <span className="text-ink/80">Source:</span> <Md inline>{e.source.cite}</Md>
                    {e.source.pin ? <>, {e.source.pin}</> : null}
                    {e.link ? <> · <a href={e.link} className="underline hover:text-ink" rel="noopener">public copy</a></> : null}
                    {(e.source.book_section || e.source.book_note) && (
                      <>
                        {' '}· in the book:
                        {e.source.book_section ? <> § {e.source.book_section}</> : null}
                        {e.source.book_note ? <>{e.source.book_section ? ',' : ''} <Link href={bookNoteHref(bookSlug, e.source.book_note)} className="underline hover:text-ink">n. {e.source.book_note}</Link></> : null}
                      </>
                    )}
                  </p>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}
