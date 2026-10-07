'use client';
// app/research/immunity-timeline/TimelineFilter.tsx — the rail of entries with two filters, by type (what the instrument is)
// and by category (which immunity). Every entry is in the HTML at build (a filter only sets data-off, so a hidden entry still
// prints and still answers its #anchor), and without script the rail shows everything. Nothing here adds to the content: the
// words are the data's. A citation links into the book's review page at its cited unit when the data names one (book_unit);
// a note links to the note on the book's text page.
import { useMemo, useState } from 'react';
import { Md } from '../../_components/Markdown';
import { BOOK_SHORT, CATEGORIES, CATEGORY_LABEL, KINDS, KIND_LABEL, bookNoteHref, bookUnitHref, eraOf, yearLabel, type Category, type Kind, type TimelineEntry } from '@/lib/immunity-timeline';

export function TimelineRail({ entries, bookBase }: { entries: TimelineEntry[]; bookBase: string }) {
  const [offCat, setOffCat] = useState<Set<Category>>(() => new Set());
  const [offKind, setOffKind] = useState<Set<Kind>>(() => new Set());
  const catCounts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const e of entries) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [entries]);
  const kindCounts = useMemo(() => {
    const c = new Map<Kind, number>();
    for (const e of entries) if (e.kind) c.set(e.kind, (c.get(e.kind) ?? 0) + 1);
    return c;
  }, [entries]);
  const cats = CATEGORIES.filter((c) => (catCounts.get(c) ?? 0) > 0);
  const kinds = KINDS.filter((k) => (kindCounts.get(k) ?? 0) > 0);
  const hidden = (e: TimelineEntry) => offCat.has(e.category) || (e.kind != null && offKind.has(e.kind));
  const shown = entries.filter((e) => !hidden(e)).length;
  const toggleCat = (c: Category) => setOffCat((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const toggleKind = (k: Kind) => setOffKind((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const anyOff = offCat.size > 0 || offKind.size > 0;
  // the era heading goes above the first entry of each era (the entries arrive sorted)
  const rows = useMemo(() => entries.map((e, i) => ({ e, era: i === 0 || eraOf(entries[i - 1].year) !== eraOf(e.year) ? eraOf(e.year) : null })), [entries]);
  const chip = (on: boolean) => `tl-chip inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] ${on ? 'bg-card border-rule text-ink' : 'bg-transparent border-rule text-muted line-through'}`;

  return (
    <>
      <div className="tl-filter mt-6 grid gap-2">
        <div className="tl-chiprow" role="group" aria-label="Show or hide types">
          <span className="tl-chiplabel">Type</span>
          {kinds.map((k) => {
            const on = !offKind.has(k);
            return (
              <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={on} data-kind={k} className={chip(on)}>
                {KIND_LABEL[k]} <span className="text-muted">{kindCounts.get(k)}</span>
              </button>
            );
          })}
        </div>
        <div className="tl-chiprow" role="group" aria-label="Show or hide categories">
          <span className="tl-chiplabel">Category</span>
          {cats.map((c) => {
            const on = !offCat.has(c);
            return (
              <button key={c} type="button" onClick={() => toggleCat(c)} aria-pressed={on} data-cat={c} className={chip(on)}>
                <span className="tl-dot" aria-hidden />{CATEGORY_LABEL[c]} <span className="text-muted">{catCounts.get(c)}</span>
              </button>
            );
          })}
        </div>
        <div className="tl-chiprow text-sm text-muted">
          <span className="tl-chiplabel" aria-hidden />
          <span>{shown} of {entries.length} shown</span>
          {anyOff && <button type="button" onClick={() => { setOffCat(new Set()); setOffKind(new Set()); }} className="underline text-accent-ink">show all</button>}
        </div>
      </div>

      <ol className="tl-rail mt-8 list-none p-0 m-0">
        {rows.map(({ e, era }) => {
          const unitHref = e.source.book_unit ? bookUnitHref(bookBase, e.source.book_unit) : null;
          return (
            <li key={e.id} className="tl-item" data-cat={e.category} data-off={hidden(e) ? '' : undefined}>
              {era && <div className="tl-era text-xs uppercase tracking-[0.14em] text-muted" style={{ fontWeight: 600 }} aria-hidden>{era}</div>}
              <article id={e.id} className="tl-entry">
                <div className="tl-year font-serif text-ink" style={{ fontWeight: 620 }}>
                  <a href={`#${e.id}`} className="no-underline hover:underline">{yearLabel(e)}</a>
                </div>
                <div className="tl-card bg-card border border-rule rounded-lg shadow-card p-5 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{e.date_text}</span>
                    <span className="tl-cat inline-flex items-center gap-1.5 uppercase tracking-[0.1em]" style={{ fontWeight: 600 }}><span className="tl-dot" aria-hidden />{CATEGORY_LABEL[e.category]}</span>
                    {e.kind && <span className="tl-kind" data-kind={e.kind}>{KIND_LABEL[e.kind]}</span>}
                  </div>
                  <h3 className="font-serif text-xl mt-1.5 leading-snug" style={{ fontWeight: 560 }}>{e.title}</h3>
                  <div className="mt-2 leading-relaxed tl-prose"><Md>{e.summary}</Md></div>
                  {e.quote && (
                    <blockquote className="mt-3 border-l-2 border-accent pl-4 font-serif text-[1.02rem] leading-relaxed text-ink/90">
                      <Md>{e.quote}</Md>
                      {e.quote_pin && <footer className="mt-1 text-xs text-muted not-italic">read at {e.quote_pin}</footer>}
                    </blockquote>
                  )}
                  {/* a div, not a p: the inline markdown of the citation renders its own paragraph, and a p inside a p is not HTML */}
                  <div className="mt-3 text-sm text-muted leading-relaxed">
                    <span className="text-ink/80">Source:</span>{' '}
                    {unitHref
                      ? <a href={unitHref} className="underline hover:text-ink" title={`Open ${BOOK_SHORT} at this citation, with the cited page beside it`}><Md inline>{e.source.cite}</Md></a>
                      : <Md inline>{e.source.cite}</Md>}
                    {e.source.pin ? <>, {e.source.pin}</> : null}
                    {e.source.read_at ? <> (read at {e.source.read_at})</> : null}
                    {e.link ? <> · <a href={e.link} className="underline hover:text-ink" rel="noopener">public copy</a></> : null}
                    {(e.source.book_section || e.source.book_note) && (
                      <>
                        {' '}· {BOOK_SHORT}
                        {e.source.book_section ? <> § {e.source.book_section}</> : null}
                        {e.source.book_note ? <>{e.source.book_section ? ' ·' : ''} <a href={bookNoteHref(bookBase, e.source.book_note)} className="underline hover:text-ink" title={`The note on the text page of ${BOOK_SHORT}`}>n. {e.source.book_note}</a></> : null}
                      </>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}
