// ReviewBody — a book beside the pages it cites. The book (server-rendered,
// passed as children) scrolls in the left card; every citation unit in its
// notes is an <a data-cite="note/seq"> written by the import, and a click on
// one opens that unit's pinned page in the right card (PdfViewer, one-page
// PDF cut from the held source). Same matched-card pattern as the archive
// leaf pages (LeafBody): h-11 header bars, h-8 sub-bars, a draggable divider
// in side-by-side, the layout choice remembered. Deep link: #cite=<note>/<seq>.
//
// Rights: only public-domain pages are published. A citation whose page is
// held in the library but not published opens a card that SAYS so (source,
// page, rights, holder link) — show-and-mark, never a silent gap.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlignLeft, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Columns, CornerLeftUp, ExternalLink, Lock, Rows } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RIGHTS_LABEL, citeFromHash, hashForCite, type ReviewManifest, type ReviewUnit } from '@/lib/review';
import { SiteHeader } from '../../../_components/SiteHeader';
import { SiteFooter } from '../../../_components/SiteFooter';
import { PdfViewer, type PdfFocus, type PdfHotBox } from '../../../_components/PdfViewer';

type Layout = 'stacked' | 'side';
const LAYOUT_KEY = 'jk-review-layout';
const SPLIT_KEY = 'jk-review-split';
const SPLIT_MIN = 30, SPLIT_MAX = 70;
const DIVIDER_PX = 14;
const BOTTOM_PAD_PX = 16;

interface Props {
  work: { slug: string; title: string; subtitle?: string; venue?: string };
  manifest: ReviewManifest;
  /** count of units that open a published page */
  published: number;
  /** where the "Text version" button leads (default: the plain reader) */
  textHref?: string;
  /** the header's back link */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

export function ReviewBody({ work, manifest, published, textHref, backHref, backLabel, children }: Props) {
  const textTo = textHref ?? `/work/${work.slug}`;
  const units = manifest.units;
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  // v2 (owner 2026-09-14): the book pane is the book's PDF with hit boxes over
  // each citation unit's lines; the rendered text (children) is the fallback
  // until the lane emits the overlay
  const pdf = manifest.pdf;
  // the files keep their names across renders and re-cuts, so a browser could
  // serve a cached copy after a deploy: every PDF URL carries its content hash
  const v = (file: string, sha: string | null | undefined) => (sha ? `${file}?v=${sha.slice(0, 12)}` : file);
  const [focus, setFocus] = useState<PdfFocus | null>(null);
  const hotBoxes = useMemo<PdfHotBox[]>(() => {
    const out: PdfHotBox[] = [];
    for (const u of units) {
      if (!u.box) continue;
      const title = `Open the cited page — n. ${u.note}`;
      for (const part of u.box.parts) for (const rect of part.rects) out.push({ id: u.id, page: part.page + 1, rect, kind: 'unit', title });
    }
    for (const m of manifest.markers) out.push({ id: `marker:${m.note}`, page: m.page + 1, rect: m.rect, kind: 'marker', title: `Go to note ${m.note}` });
    return out;
  }, [units, manifest.markers]);
  /** scroll the book PDF to a unit's first line */
  const focusUnit = useCallback((u: ReviewUnit | undefined) => {
    const part = u?.box?.parts[0];
    if (!part || !part.rects[0]) return;
    setFocus({ page: part.page + 1, y: part.rects[0][1], nonce: Date.now() });
  }, []);
  const active: ReviewUnit | null = activeId ? byId.get(activeId) ?? null : null;
  const idx = active ? units.indexOf(active) : -1;
  const page = active?.pages[pageIdx] ?? null;
  // the page's own source when a unit spans two sources; else the unit's
  const sourceKey = page?.source ?? active?.source ?? null;
  const source = sourceKey ? manifest.sources[sourceKey] : undefined;
  const rights = page?.rights || active?.rights || '';

  // layout (LeafBody's pattern): side by side by default on large screens
  const [layout, setLayout] = useState<Layout>('side');
  const [split, setSplit] = useState(50);
  const [isLg, setIsLg] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const belowRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => setIsLg(mq.matches);
    const t = setTimeout(() => {
      try {
        const l = localStorage.getItem(LAYOUT_KEY);
        if (l === 'side' || l === 'stacked') setLayout(l);
        const stored = Number(localStorage.getItem(SPLIT_KEY));
        if (stored >= SPLIT_MIN && stored <= SPLIT_MAX) setSplit(stored);
      } catch { /* storage unavailable */ }
      onMq();
      // deep link: select the unit and bring its link into view in the book
      const c = citeFromHash(window.location.hash);
      if (c && byId.has(c.id)) {
        const id = c.id;
        setActiveId(id);
        setPageIdx(Math.min(c.page, Math.max(0, (byId.get(id)?.pages.length ?? 1) - 1)));
        if (pdf) setTimeout(() => focusUnit(byId.get(id)), 400); // after the PDF's pages exist
        else setTimeout(() => bookRef.current?.querySelector<HTMLElement>(`a[data-cite="${id}"]`)?.scrollIntoView({ block: 'center' }), 50);
      }
    }, 0);
    mq.addEventListener('change', onMq);
    const onHash = () => { const c = citeFromHash(window.location.hash); if (c && byId.has(c.id)) { setActiveId(c.id); setPageIdx(Math.min(c.page, Math.max(0, (byId.get(c.id)?.pages.length ?? 1) - 1))); } };
    window.addEventListener('hashchange', onHash);
    return () => { clearTimeout(t); mq.removeEventListener('change', onMq); window.removeEventListener('hashchange', onHash); };
  }, [byId, pdf, focusUnit]);

  const changeLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ } };
  const review = layout === 'side' && isLg;

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const below = belowRef.current ? belowRef.current.offsetHeight + 12 : 48;
    setFillHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - below - BOTTOM_PAD_PX));
  }, []);
  useEffect(() => {
    if (!review) return;
    const t = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [review, measure]);

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    setSplit(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
    setSplit((s) => { try { localStorage.setItem(SPLIT_KEY, String(Math.round(s))); } catch { /* ignore */ } return s; });
  };
  const resetSplit = () => { setSplit(50); try { localStorage.setItem(SPLIT_KEY, '50'); } catch { /* ignore */ } };

  /** select a unit and one of its cited pages; `reveal` scrolls its link into view in the book */
  const select = useCallback((id: string, reveal: boolean, pageIndex = 0) => {
    setActiveId(id);
    setPageIdx(pageIndex);
    try { history.replaceState(null, '', hashForCite(id, pageIndex)); } catch { /* ignore */ }
    if (reveal) {
      if (pdf) focusUnit(byId.get(id));
      else bookRef.current?.querySelector<HTMLElement>(`a[data-cite="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // stacked / small screens: bring the source pane into view
    if (!(layout === 'side' && isLg) && sourceRef.current) sourceRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [layout, isLg, pdf, focusUnit, byId]);

  // a hit box in the book PDF: a unit opens its page; a marker goes to its note
  const onHot = (b: PdfHotBox) => {
    if (b.kind === 'marker') {
      const note = b.id.slice('marker:'.length);
      const first = units.find((u) => u.note === note && u.box);
      if (first) { select(first.id, true); }
      return;
    }
    if (byId.has(b.id)) select(b.id, false);
  };

  // clicks on citation links inside the server-rendered book
  const onBookClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-cite]');
    if (!a) return;
    const id = a.dataset.cite;
    if (!id || !byId.has(id)) return;
    e.preventDefault();
    select(id, false);
  };

  // highlight the active unit's link
  useEffect(() => {
    const root = bookRef.current;
    if (!root) return;
    root.querySelectorAll('.cite-active').forEach((el) => el.classList.remove('cite-active'));
    if (activeId) root.querySelector(`a[data-cite="${activeId}"]`)?.classList.add('cite-active');
  }, [activeId]);

  /** previous / next walks THROUGH the unit's cited pages before moving to the neighbouring citation */
  const step = (d: -1 | 1) => {
    if (active && active.pages.length > 1) {
      const next = pageIdx + d;
      if (next >= 0 && next < active.pages.length) { setPageIdx(next); try { history.replaceState(null, '', hashForCite(active.id, next)); } catch { /* ignore */ } return; }
    }
    const n = units[idx + d];
    if (n) select(n.id, true, d < 0 ? Math.max(0, n.pages.length - 1) : 0);
  };
  const goPage = (i: number) => { if (!active) return; setPageIdx(i); try { history.replaceState(null, '', hashForCite(active.id, i)); } catch { /* ignore */ } };
  const toNote = () => {
    if (!active) return;
    if (pdf) { focusUnit(active); return; }
    const el = bookRef.current?.querySelector<HTMLElement>(`a[data-cite="${active.id}"]`) ?? bookRef.current?.querySelector<HTMLElement>(`#user-content-fn-${active.note.toLowerCase()}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const tog = (on: boolean) => cn('h-7 w-7 inline-flex items-center justify-center rounded', on ? 'bg-accent/20 text-accent-ink' : 'text-muted hover:bg-well');
  const ctl = 'h-7 min-w-7 px-1.5 inline-flex items-center justify-center gap-1 rounded text-xs text-accent-ink hover:bg-well disabled:opacity-35 disabled:hover:bg-transparent tabular-nums';
  const sourceTitle = source?.title ?? sourceKey ?? '';
  const pageTitle = page ? `${sourceTitle}, ${page.label}` : sourceTitle;

  // toolbar-left of the source pane: previous · citation i/N · next · to the note · page stepper
  const controls = (
    <div className="flex items-center gap-1 min-w-0 whitespace-nowrap">
      <button type="button" className={ctl} onClick={() => step(-1)} disabled={idx <= 0} title="Previous citation" aria-label="Previous citation"><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-xs text-muted tabular-nums px-0.5" style={{ fontWeight: 500 }}>
        {idx >= 0 ? `${idx + 1} / ${units.length}` : `${units.length} citations`}
        {active && active.pages.length > 1 && <> · page {pageIdx + 1}/{active.pages.length}</>}
      </span>
      <button type="button" className={ctl} onClick={() => step(1)} disabled={idx < 0 || (idx >= units.length - 1 && pageIdx >= (active?.pages.length ?? 1) - 1)} title={active && pageIdx < active.pages.length - 1 ? 'Next cited page' : 'Next citation'} aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
      {active && (
        <button type="button" className={cn(ctl, 'ml-1')} onClick={toNote} title={`Show note ${active.note} in the book`}><CornerLeftUp className="h-3.5 w-3.5" /> n. {active.note}</button>
      )}
    </div>
  );

  // the page strip: every page the unit cites, grouped by source when it draws on two,
  // the active page marked, a held page shown as a marked label rather than dropped
  // (no memo: a unit cites at most a couple of dozen pages)
  const groups: { source: string | null; title: string; items: { i: number; label: string; file: string | null }[] }[] = [];
  active?.pages.forEach((p, i) => {
    const src = p.source ?? active.source;
    let g = groups[groups.length - 1];
    if (!g || g.source !== src) { g = { source: src, title: (src && manifest.sources[src]?.title) || src || '', items: [] }; groups.push(g); }
    g.items.push({ i, label: p.label, file: p.file });
  });
  const pageStrip = active && active.pages.length > 1 ? (
    <div className="shrink-0 mb-2 rounded-lg border border-rule bg-card shadow-card px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" role="tablist" aria-label="Pages cited by this citation">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted" style={{ fontWeight: 600 }}>{active.pages.length} pages cited</span>
      {groups.map((g, gi) => (
        <span key={`${g.source}-${gi}`} className="inline-flex flex-wrap items-center gap-1">
          {groups.length > 1 && <span className="text-xs text-muted mr-0.5 truncate max-w-[16rem]" title={g.title}>{g.title}</span>}
          {g.items.map((it) => (
            <button key={it.i} type="button" role="tab" aria-selected={pageIdx === it.i} onClick={() => goPage(it.i)}
              title={it.file ? `Open ${it.label}` : `${it.label} — held in the library, not published`}
              className={cn('h-7 px-2 rounded-md text-xs tabular-nums transition-colors inline-flex items-center gap-1',
                pageIdx === it.i ? 'bg-ink text-on-ink' : it.file ? 'border border-rule text-ink/85 hover:bg-well' : 'border border-dashed border-rule text-muted hover:bg-well')}
              style={{ fontWeight: pageIdx === it.i ? 600 : 500 }}>
              {!it.file && <Lock className="h-3 w-3" aria-hidden />}{it.label}
            </button>
          ))}
        </span>
      ))}
    </div>
  ) : null;

  const paneShell = 'bg-card border border-rule rounded-lg shadow-card flex flex-col min-h-0';
  const barTitle = 'font-serif text-[15px] leading-none';

  const sourcePane = (
    <div ref={sourceRef} className={cn('min-w-0 flex flex-col', review ? 'h-full min-h-0' : 'lg:sticky lg:top-3 z-10')}>
      {pageStrip}
      {page?.file ? (
        <PdfViewer key={page.file} src={v(page.file, page.sha256)} title={pageTitle} downloadName={page.file.split('/').pop()}
          height={review ? 'fill' : 'page'} chrome="pane" leading={controls} />
      ) : (
        <div className={cn(paneShell, review ? 'h-full' : 'min-h-[24rem]')}>
          <div className="h-11 px-3 flex items-center justify-between gap-3 border-b border-rule">{controls}</div>
          <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">{active ? pageTitle : 'No citation selected'}</div>
          <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 text-sm leading-relaxed">
            {!active ? (
              <>
                <p className="font-serif text-xl text-ink" style={{ fontWeight: 620 }}>Check the work at the page.</p>
                <p className="mt-3 text-ink/85">Every citation in the notes is a link. Click one and the page it cites opens here, cut from the held copy of the source, so the quotation and the pin can be read against the original without leaving this screen.</p>
                <p className="mt-3 text-ink/85">{published.toLocaleString('en-US')} citations open a published page, from {Object.keys(manifest.sources).length} sources. Pages still in copyright, or reproduced under a licence, are held in the library and marked here rather than shown.</p>
                <p className="mt-5"><button type="button" onClick={() => units[0] && select(units[0].id, true)} className="inline-flex items-center gap-1.5 rounded-md bg-ink text-on-ink px-3 py-1.5 text-sm no-underline hover:bg-ink/90" style={{ fontWeight: 600 }}>Start at the first citation <ArrowRight className="h-4 w-4" /></button></p>
              </>
            ) : (
              <>
                <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-muted" style={{ fontWeight: 600 }}><Lock className="h-3.5 w-3.5" /> Held in the library, not published</p>
                <p className="font-serif text-lg text-ink mt-3 leading-snug" style={{ fontWeight: 620 }}>{sourceTitle}</p>
                {page ? <p className="mt-1 text-ink/85">{page.label}</p> : active.pages.length > 0 && <p className="mt-1 text-ink/85">{active.pages.map((p) => p.label).join(' · ')}</p>}
                <p className="mt-4 text-ink/85">
                  {rights && RIGHTS_LABEL[rights] ? <>{RIGHTS_LABEL[rights]}. </> : null}
                  {active.status === 'NO_SOURCE' && 'The cited edition is not held in the library; nothing is shown that was not read.'}
                  {active.status === 'NO_PIN' && 'The note cites the work without a page, so no page is opened.'}
                  {active.status === 'UNMAPPED' && 'The cited page could not be located in the held scan.'}
                  {(active.status === 'CUT' || active.status === 'CUT_FIRST') && 'The page is held and was read for this book; its reproduction is not the author’s to publish.'}
                </p>
                {source?.holderUrl && (
                  <p className="mt-3"><a href={source.holderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-accent-ink break-all">The holder’s copy <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></p>
                )}
              </>
            )}
          </div>
          <div className="h-8 border-t border-rule" />
        </div>
      )}
    </div>
  );

  const textLink = (
    <Link href={textTo} className="h-7 px-2 inline-flex items-center gap-1 rounded text-xs text-accent-ink hover:bg-well no-underline whitespace-nowrap" title="The book as text, with the same citation links">
      <AlignLeft className="h-3.5 w-3.5" /> Text version
    </Link>
  );
  const bookPane = pdf ? (
    <div className={cn('min-w-0', review && 'h-full min-h-0 flex flex-col')}>
      <PdfViewer src={v(pdf.file, pdf.sha256)} downloadSrc={pdf.linked ? v(pdf.linked.file, pdf.linked.sha256) : undefined} downloadName={`${work.slug}.pdf`} title={`${work.title}${work.subtitle ? `: ${work.subtitle}` : ''} — ${work.venue ?? 'working draft'}; the citations in the notes are clickable`}
        height={review ? 'fill' : 'page'} chrome="pane" leading={textLink} hotBoxes={hotBoxes} activeHot={activeId} onHot={onHot} focus={focus} />
    </div>
  ) : (
    <div className={cn('min-w-0', review && 'h-full min-h-0 flex flex-col')}>
      <div className={cn(paneShell, review && 'h-full')}>
        <div className="h-11 px-4 flex items-center justify-between gap-3 border-b border-rule">
          <span className={cn(barTitle, 'truncate')} style={{ fontWeight: 620 }}>{work.title}{work.subtitle ? <span className="text-muted font-sans text-xs ml-2" style={{ fontWeight: 500 }}>{work.subtitle}</span> : null}</span>
          <span className="text-xs text-muted shrink-0">{work.venue ?? 'Working draft'}</span>
        </div>
        <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">Citations in the notes are links — click one to open the cited page beside the text.</div>
        <div ref={bookRef} onClick={onBookClick} className={cn('min-h-0', review ? 'flex-1 overflow-y-auto' : '')}>
          {children}
        </div>
        <div className="h-8 border-t border-rule" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className={cn('flex-grow w-full', review ? 'max-w-none px-4 py-4' : 'mx-auto max-w-site px-5 sm:px-8 py-6')}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Link href={backHref ?? textTo} className="inline-flex items-center text-sm text-muted hover:text-ink no-underline"><ArrowLeft className="h-4 w-4 mr-1.5" />{backLabel ?? `${work.title} — the reader`}</Link>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.06em] text-accent-ink border border-accent/40 bg-accent/15 rounded-md px-2 py-0.5" style={{ fontWeight: 600 }}>Review mode</span>
            <span className="hidden lg:inline-flex items-center gap-0.5 bg-card border border-rule rounded-md shadow-card p-0.5">
              <button type="button" className={tog(layout === 'side')} onClick={() => changeLayout('side')} aria-pressed={layout === 'side'} title="Side by side — book beside the cited page" aria-label="Side-by-side layout"><Columns className="h-4 w-4" /></button>
              <button type="button" className={tog(layout === 'stacked')} onClick={() => changeLayout('stacked')} aria-pressed={layout === 'stacked'} title="Stacked — cited page above, book below" aria-label="Stacked layout"><Rows className="h-4 w-4" /></button>
            </span>
          </div>
        </div>

        <div ref={rowRef}
          className={cn('grid grid-cols-1 gap-4', layout === 'side' ? 'lg:grid-cols-2 lg:items-stretch' : 'items-start max-w-5xl mx-auto', review && 'lg:gap-0')}
          style={review && fillHeight ? { height: fillHeight, gridTemplateColumns: `${split}% ${DIVIDER_PX}px minmax(0, 1fr)` } : undefined}>
          {review ? bookPane : sourcePane}
          {review && (
            <div role="separator" aria-orientation="vertical" aria-label="Resize the book/source split" title="Drag to resize · double-click to recenter"
              onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onDoubleClick={resetSplit}
              className={cn('h-full cursor-col-resize touch-none select-none flex items-center justify-center group', dragging && 'bg-accent/10')}>
              <div className={cn('w-1 h-16 rounded-full bg-rule group-hover:bg-accent transition-colors', dragging && 'bg-accent')} />
            </div>
          )}
          {review ? sourcePane : bookPane}
        </div>

        {/* below the panes — the cited page's record (left) · the book's record (right) */}
        <div ref={belowRef} className={cn('mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[11px] text-muted leading-relaxed', layout !== 'side' && 'max-w-5xl mx-auto')}>
          <div className="min-w-0 space-y-0.5">
            {page ? (
              <>
                <p>
                  <span className="text-ink/80" style={{ fontWeight: 550 }}>{pageTitle}</span>
                  {' · '}{page.verified === true ? 'page number read on the page' : page.verified === false ? 'page placed by the scan’s offset — the number was not read on it' : 'a verso with no number to read'}
                  {active?.status === 'CUT_FIRST' && ' · the note cites the work without a page: its first page is shown'}
                  {page.file && <> · <a href={v(page.file, page.sha256)} target="_blank" rel="noopener noreferrer" className="underline text-accent-ink">open the page PDF</a></>}
                  {rights && RIGHTS_LABEL[rights] && <> · {RIGHTS_LABEL[rights]}</>}
                </p>
                {page.sha256 && <p className="font-mono break-all">sha256 {page.sha256}</p>}
              </>
            ) : (
              <p>{manifest.rightsRule}</p>
            )}
          </div>
          <p className="ml-auto text-right">
            {pdf ? <>PDF rendered {pdf.rendered} ({pdf.pages} pp.; sha256 <span className="font-mono">{pdf.sha256.slice(0, 12)}…</span>) · </> : null}
            text current to {manifest.generated.slice(0, 10)} (sha256 <span className="font-mono">{manifest.book.sha256.slice(0, 12)}…</span>{manifest.book.commit ? <>, blob {manifest.book.commit.slice(0, 8)}</> : null})
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
