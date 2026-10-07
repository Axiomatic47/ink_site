'use client';
// app/research/immunity-timeline/TimelineFilter.tsx — the rail of entries with two filters, by type (what the instrument is)
// and by category (which immunity). A chip SELECTS: the row starts at "All"; choosing a chip shows only that type or category,
// choosing more in the same row adds them together, and the two rows combine (an entry must match both). The selected chips
// are the filled ones; "All" is the default and the way back. The selection LIVES IN THE URL (?type=…&category=…) — the one
// source of truth, read through React's external-store hook so the server's render and the first client render agree ("All")
// and a filtered view can be sent to someone; a chip writes the URL and tells the store. Every entry is in the HTML at build (a filter only sets data-off, so a hidden
// entry still prints and still answers its #anchor), and without script the rail shows everything. Nothing here adds to the
// content: the words are the data's. A citation links into the book's review page at its cited unit when the data names one
// (book_unit); a note links to the note on the book's text page.
import { useMemo, useSyncExternalStore } from 'react';
import { Md } from '../../_components/Markdown';
import { BOOK_SHORT, CATEGORIES, CATEGORY_LABEL, KINDS, KIND_LABEL, bookNoteHref, bookUnitHref, eraOf, isCategory, isKind, yearLabel, type Category, type Kind, type TimelineEntry } from '@/lib/immunity-timeline';

const TYPE_KEY = 'type';
const CATEGORY_KEY = 'category';

const CHANGE = 'tl-filter-change';

// the store: the page's query string. Subscribers hear the browser's own navigation and this page's own writes.
function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(CHANGE, onChange);
  return () => { window.removeEventListener('popstate', onChange); window.removeEventListener(CHANGE, onChange); };
}
const readSearch = () => window.location.search;
const readServerSearch = () => '';

function parseSelection(search: string): { kinds: Set<Kind>; cats: Set<Category> } {
  const p = new URLSearchParams(search);
  return {
    kinds: new Set((p.get(TYPE_KEY) ?? '').split(',').filter(isKind)),
    cats: new Set((p.get(CATEGORY_KEY) ?? '').split(',').filter(isCategory)),
  };
}

function writeSelection(kinds: Set<Kind>, cats: Set<Category>) {
  const p = new URLSearchParams(window.location.search);
  if (kinds.size) p.set(TYPE_KEY, KINDS.filter((k) => kinds.has(k)).join(',')); else p.delete(TYPE_KEY);
  if (cats.size) p.set(CATEGORY_KEY, CATEGORIES.filter((c) => cats.has(c)).join(',')); else p.delete(CATEGORY_KEY);
  const q = p.toString();
  try { window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE));
}

export function TimelineRail({ entries, bookBase }: { entries: TimelineEntry[]; bookBase: string }) {
  // an empty set means "All" in that row; the server and the first client render read '' (All), then the URL's selection
  const search = useSyncExternalStore(subscribe, readSearch, readServerSearch);
  const { kinds: selKind, cats: selCat } = useMemo(() => parseSelection(search), [search]);

  const kindCounts = useMemo(() => {
    const c = new Map<Kind, number>();
    for (const e of entries) if (e.kind) c.set(e.kind, (c.get(e.kind) ?? 0) + 1);
    return c;
  }, [entries]);
  const catCounts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const e of entries) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [entries]);
  const kinds = KINDS.filter((k) => (kindCounts.get(k) ?? 0) > 0);
  const cats = CATEGORIES.filter((c) => (catCounts.get(c) ?? 0) > 0);

  // the era heading goes above the first SHOWN entry of each era (the entries arrive sorted)
  const rows = useMemo(() => {
    const out: { e: TimelineEntry; on: boolean; era: string | null }[] = [];
    let lastEra: string | null = null;
    for (const e of entries) {
      const on = (selKind.size === 0 || (e.kind != null && selKind.has(e.kind))) && (selCat.size === 0 || selCat.has(e.category));
      let era: string | null = null;
      if (on && eraOf(e.year) !== lastEra) { era = eraOf(e.year); lastEra = era; }
      out.push({ e, on, era });
    }
    return out;
  }, [entries, selKind, selCat]);
  const shown = rows.filter((r) => r.on).length;
  const filtered = selKind.size > 0 || selCat.size > 0;
  const toggleKind = (k: Kind) => { const n = new Set(selKind); if (n.has(k)) n.delete(k); else n.add(k); writeSelection(n, selCat); };
  const toggleCat = (c: Category) => { const n = new Set(selCat); if (n.has(c)) n.delete(c); else n.add(c); writeSelection(selKind, n); };
  const allKinds = () => writeSelection(new Set(), selCat);
  const allCats = () => writeSelection(selKind, new Set());
  const clear = () => writeSelection(new Set(), new Set());

  const chip = (selected: boolean) =>
    `tl-chip inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] ${selected ? 'bg-ink border-ink text-paper' : 'bg-card border-rule text-ink hover:border-ink/50'}`;
  const what = [
    ...KINDS.filter((k) => selKind.has(k)).map((k) => KIND_LABEL[k]),
    ...CATEGORIES.filter((c) => selCat.has(c)).map((c) => CATEGORY_LABEL[c]),
  ];

  return (
    <>
      <div className="tl-filter mt-6 grid gap-2">
        <div className="tl-chiprow" role="group" aria-label="Show only these types">
          <span className="tl-chiplabel">Type</span>
          <button type="button" onClick={allKinds} aria-pressed={selKind.size === 0} className={chip(selKind.size === 0)}>All</button>
          {kinds.map((k) => {
            const on = selKind.has(k);
            return (
              <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={on} data-kind={k} className={chip(on)}>
                {KIND_LABEL[k]} <span className={on ? 'text-paper/70' : 'text-muted'}>{kindCounts.get(k)}</span>
              </button>
            );
          })}
        </div>
        <div className="tl-chiprow" role="group" aria-label="Show only these categories">
          <span className="tl-chiplabel">Category</span>
          <button type="button" onClick={allCats} aria-pressed={selCat.size === 0} className={chip(selCat.size === 0)}>All</button>
          {cats.map((c) => {
            const on = selCat.has(c);
            return (
              <button key={c} type="button" onClick={() => toggleCat(c)} aria-pressed={on} data-cat={c} className={chip(on)}>
                <span className="tl-dot" aria-hidden />{CATEGORY_LABEL[c]} <span className={on ? 'text-paper/70' : 'text-muted'}>{catCounts.get(c)}</span>
              </button>
            );
          })}
        </div>
        <div className="tl-chiprow text-sm text-muted" aria-live="polite">
          <span className="tl-chiplabel" aria-hidden />
          {filtered
            ? <span>Showing {shown} of {entries.length}: {what.join(' · ')}. <button type="button" onClick={clear} className="underline text-accent-ink">Show all</button></span>
            : <span>Showing all {entries.length} entries.</span>}
        </div>
      </div>

      <ol className="tl-rail mt-8 list-none p-0 m-0">
        {rows.map(({ e, on, era }) => {
          const unitHref = e.source.book_unit ? bookUnitHref(bookBase, e.source.book_unit) : null;
          return (
            <li key={e.id} className="tl-item" data-cat={e.category} data-off={on ? undefined : ''}>
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
