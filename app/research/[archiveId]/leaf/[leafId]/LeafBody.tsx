// LeafBody — one archive leaf: the image in a zoom/pan viewer beside its
// reviewer-facing PDFs as tabs. Ported from lawsofexistence.com and re-skinned.
//
// Manuscript review layout (owner 2026-09-13): the two panes are matched
// cards — each has an h-11 header bar (image: leaf label + zoom controls;
// document: tabs + download/new-tab), an h-8 sub-bar (image: credit;
// document: title), a body, and an h-8 footer — so their edges sit level.
// Side by side is the DEFAULT on large screens (the stacked toggle remains
// and is remembered); the leaf pager and the fixity block sit BELOW the
// panes. In side-by-side the row fills the viewport with a draggable divider.
//
// Where the document opens (owner 2026-09-21, "transcriptions linked to the
// right folio; citation links to the correct page"): a `#page=N` fragment on
// the leaf URL — a citation to an exact PDF page — wins; else the page where
// this leaf's text begins in a multi-leaf document (`doc.page`, from the
// edition's page map); else page 1. The fragment addresses the leaf's FIRST
// document (the transcription); the other tabs open at their own leaf page.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Columns, Rows } from 'lucide-react';
import { type ArchiveDoc, type ArchiveLeafEntry, type ArchiveManifest, archiveBase, imagesPublished, publishedDocs } from '@/lib/research-archive';
import { cn } from '@/lib/cn';
import { SiteHeader } from '../../../../_components/SiteHeader';
import { SiteFooter } from '../../../../_components/SiteFooter';
import { LeafImageViewer } from '../../../../_components/LeafImageViewer';
import { PdfViewer, type PdfFocus } from '../../../../_components/PdfViewer';

type LeafLayout = 'stacked' | 'side';
const LAYOUT_KEY = 'jk-archive-layout';
const SPLIT_KEY = 'jk-archive-split';
const SPLIT_MIN = 25, SPLIT_MAX = 75;
const DIVIDER_PX = 14;
// the below-panes row is measured live; this is the slack under it
const BOTTOM_PAD_PX = 16;

/** the `#page=N` fragment of a leaf URL (1-based PDF page of the leaf's document); null when absent or not that shape */
export function pageFragment(hash: string): number | null {
  const m = /^#page=([1-9]\d{0,3})$/.exec((hash || '').trim());
  return m ? Number(m[1]) : null;
}

interface Props {
  archiveId: string;
  refLabel: string;
  leafLabel: string;
  manifest: ArchiveManifest;
  leaf: ArchiveLeafEntry;
  prev: string | null;
  next: string | null;
  /** open readings whose source is this leaf */
  openReadings?: { collection: string; id: string }[];
}

export function LeafBody({ archiveId, refLabel, leafLabel, manifest, leaf, prev, next, openReadings = [] }: Props) {
  const tabs = useMemo(() => {
    const t: Array<{ key: string; label: string; doc: ArchiveDoc }> = [];
    const seen = new Set<string>();
    for (const d of publishedDocs(leaf)) {
      if (seen.has(d.pdf)) continue;
      seen.add(d.pdf);
      t.push({ key: d.pdf, label: d.kind === 'edition' ? 'Transcription' : d.kind === 'transcript' ? 'Transcript' : d.kind === 'index' ? 'Line index' : `Transcription ${d.span || ''}`.trim(), doc: d });
    }
    return t;
  }, [leaf]);
  const [active, setActive] = useState<string | null>(null);
  const activeTab = tabs.find((t) => t.key === active) || tabs[0] || null;

  // the URL fragment, read after hydration and on every hash change (a citation chip on the same
  // page may change only the fragment)
  const [frag, setFrag] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setFrag(pageFragment(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  // the page the document opens at: fragment (first document only) → the leaf's own page → none (page 1)
  const targetPage = activeTab ? (frag && activeTab.key === tabs[0]?.key ? frag : activeTab.doc.page ?? null) : null;
  const [focus, setFocus] = useState<PdfFocus | null>(null);
  const nonceRef = useRef(0);
  const activeKey = activeTab?.key ?? null;
  useEffect(() => {
    // a fresh nonce per target or tab: the viewer applies a focus once per nonce (see PdfViewer)
    nonceRef.current += 1;
    setFocus(targetPage ? { page: targetPage, y: 0, nonce: nonceRef.current } : null);
  }, [targetPage, activeKey]);

  // side by side is the default; a stored choice (either way) wins after hydration
  const [layout, setLayout] = useState<LeafLayout>('side');
  const [split, setSplit] = useState(50);
  const [isLg, setIsLg] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const belowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // stored preferences + breakpoint, adopted after hydration
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
    }, 0);
    mq.addEventListener('change', onMq);
    return () => { clearTimeout(t); mq.removeEventListener('change', onMq); };
  }, []);

  const changeLayout = (l: LeafLayout) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ } };
  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    // fill from the row's top edge to the viewport bottom, leaving room for
    // the pager/fixity row beneath the panes
    const below = belowRef.current ? belowRef.current.offsetHeight + 12 : 48;
    setFillHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - below - BOTTOM_PAD_PX));
  }, []);
  useEffect(() => {
    if (!(layout === 'side' && isLg)) return;
    const t = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [layout, isLg, measure]);
  const review = layout === 'side' && isLg;

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

  const pdfUrl = activeTab ? `${archiveBase(archiveId)}/${activeTab.doc.pdf}` : null;
  const published = imagesPublished(manifest);
  const tog = (on: boolean) => cn('h-7 w-7 inline-flex items-center justify-center rounded', on ? 'bg-accent/20 text-accent-ink' : 'text-muted hover:bg-well');
  const pagerBtn = 'h-8 px-2.5 inline-flex items-center gap-1 rounded text-sm text-accent-ink hover:bg-well no-underline tabular-nums';

  const docTabs = (
    <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap min-w-0" role="tablist" aria-label="Documents for this leaf">
      {tabs.map((t) => {
        const on = activeTab?.key === t.key;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setActive(t.key)}
            className={cn('h-7 px-2.5 rounded-md text-xs transition-colors shrink-0', on ? 'bg-ink text-on-ink' : 'text-ink/80 hover:bg-well border border-rule')}
            style={{ fontWeight: on ? 600 : 500 }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className={cn('flex-grow w-full', review ? 'max-w-none px-4 py-4' : 'mx-auto max-w-site px-5 sm:px-8 py-6')}>
        {/* header row — back link · open readings · layout toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Link href={`/research/${archiveId}`} className="inline-flex items-center text-sm text-muted hover:text-ink no-underline"><ArrowLeft className="h-4 w-4 mr-1.5" />{refLabel} — archive</Link>
          <div className="flex items-center gap-2">
            {openReadings.length > 0 && (
              <Link href={openReadings.length === 1 ? `/research/${openReadings[0].collection}/readings/${openReadings[0].id}` : `/research/${openReadings[0].collection}/readings`} className="text-xs uppercase tracking-[0.06em] text-accent-ink border border-accent/40 bg-accent/15 rounded-md px-2 py-0.5 no-underline" style={{ fontWeight: 600 }}>
                {openReadings.length} open reading{openReadings.length === 1 ? '' : 's'} on this leaf
              </Link>
            )}
            <span className="hidden lg:inline-flex items-center gap-0.5 bg-card border border-rule rounded-md shadow-card p-0.5">
              <button type="button" className={tog(layout === 'side')} onClick={() => changeLayout('side')} aria-pressed={layout === 'side'} title="Side by side — image beside document" aria-label="Side-by-side layout"><Columns className="h-4 w-4" /></button>
              <button type="button" className={tog(layout === 'stacked')} onClick={() => changeLayout('stacked')} aria-pressed={layout === 'stacked'} title="Stacked — image above, document below" aria-label="Stacked layout"><Rows className="h-4 w-4" /></button>
            </span>
          </div>
        </div>

        {/* the two panes */}
        <div ref={rowRef}
          className={cn(
            'grid grid-cols-1 gap-4',
            // side by side prerenders as two equal columns ≥lg (no flash from
            // stacked); once hydrated the divider column and measured height arrive
            layout === 'side' ? 'lg:grid-cols-2 lg:items-stretch' : 'items-start max-w-4xl mx-auto',
            review && 'lg:gap-0'
          )}
          style={review && fillHeight ? { height: fillHeight, gridTemplateColumns: `${split}% ${DIVIDER_PX}px minmax(0, 1fr)` } : undefined}>
          {/* leaf image */}
          <div className={cn('min-w-0', review && 'h-full min-h-0 flex flex-col')}>
            <LeafImageViewer
              src={`${archiveBase(archiveId)}/${leaf.web ?? leaf.image}`}
              alt={`${refLabel} ${leafLabel.toLowerCase()} ${leaf.id}`}
              heightClass={review ? 'flex-1 min-h-0' : 'h-[56vh] lg:h-[64vh]'}
              fitMode={published ? 'width' : 'contain'}
              title={<>{leafLabel} {leaf.id} <span className="text-muted font-sans text-xs ml-1.5" style={{ fontWeight: 500 }}>{refLabel}</span></>}
              subtitle={published
                ? (leaf.credit ?? refLabel)
                : <>Placeholder — the leaf image awaits a reproduction licence from {manifest.images?.rightsHolder || 'the rights holder'}.</>}
            />
          </div>

          {review && (
            <div role="separator" aria-orientation="vertical" aria-label="Resize the image/document split" title="Drag to resize · double-click to recenter"
              onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onDoubleClick={resetSplit}
              className={cn('h-full cursor-col-resize touch-none select-none flex items-center justify-center group', dragging && 'bg-accent/10')}>
              <div className={cn('w-1 h-16 rounded-full bg-rule group-hover:bg-accent transition-colors', dragging && 'bg-accent')} />
            </div>
          )}

          {/* documents */}
          <div className={cn('min-w-0', review && 'h-full min-h-0 flex flex-col')}>
            {tabs.length === 0 || !pdfUrl || !activeTab ? (
              <div className="bg-card border border-rule rounded-lg shadow-card p-8 text-sm text-muted">The transcript of this leaf is not yet published — the image stands alone until it is.</div>
            ) : (
              <PdfViewer key={pdfUrl} src={pdfUrl} title={activeTab.doc.title} downloadName={pdfUrl.split('/').pop()}
                height={review ? 'fill' : 'page'} chrome="pane" leading={docTabs} focus={focus} />
            )}
          </div>
        </div>

        {/* below the panes — fixity (left) · leaf pager (right) */}
        <div ref={belowRef} className={cn('mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2', layout !== 'side' && 'max-w-4xl mx-auto')}>
          <div className="min-w-0 text-[11px] text-muted leading-relaxed space-y-0.5">
            {published ? (
              <>
                <p>
                  <a href={`${archiveBase(archiveId)}/${leaf.image}`} download className="underline text-accent-ink" style={{ fontWeight: 550 }}>
                    Download the full-resolution original{leaf.imageBytes ? ` (${Math.round(leaf.imageBytes / 1e6)} MB)` : ''}
                  </a>{' '}— for private study and non-commercial research.
                  {leaf.web && <> Shown at web resolution; the hash is the original&rsquo;s.</>}
                  {manifest.images?.creditUrl && <> · <a href={manifest.images.creditUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">{manifest.images.creditUrl.replace(/^https?:\/\//, '')}</a></>}
                </p>
                {leaf.sha256 && <p className="font-mono break-all">sha256 {leaf.sha256}</p>}
              </>
            ) : (
              leaf.sha256 && <p className="font-mono break-all">Source-image sha256 (recorded fixity): {leaf.sha256}</p>
            )}
            {activeTab?.doc.credit && (
              <p className="pt-1">
                <span className="text-ink/80" style={{ fontWeight: 550 }}>{activeTab.doc.credit}</span>
                {activeTab.doc.span && <> · {leafLabel.toLowerCase()}{activeTab.doc.span.includes('–') ? 's' : ''} {activeTab.doc.span.replace(/^0+/, '').replace(/–0+/, '–')}</>}
                {targetPage && <> · opened at page {targetPage}{activeTab.doc.page && targetPage !== activeTab.doc.page ? <> (this {leafLabel.toLowerCase()} begins on page {activeTab.doc.page})</> : null}</>}
                {' · '}published in full with the author’s agreement · the record: The National Archives, ref. {refLabel}
                {activeTab.doc.sha256 && <> · <span className="font-mono">sha256 {activeTab.doc.sha256.slice(0, 12)}…</span></>}
              </p>
            )}
          </div>
          <nav aria-label="Leaf navigation" className="ml-auto inline-flex items-center gap-0.5 bg-card border border-rule rounded-md shadow-card p-0.5">
            {prev ? (
              <Link href={`/research/${archiveId}/leaf/${prev}`} className={pagerBtn} rel="prev"><ArrowLeft className="h-3.5 w-3.5" /> {prev}</Link>
            ) : (
              <span className={cn(pagerBtn, 'opacity-40 pointer-events-none')} aria-hidden="true"><ArrowLeft className="h-3.5 w-3.5" /> —</span>
            )}
            <span className="font-serif px-3 text-[15px] tabular-nums" style={{ fontWeight: 620 }}>{leafLabel} {leaf.id}</span>
            {next ? (
              <Link href={`/research/${archiveId}/leaf/${next}`} className={pagerBtn} rel="next">{next} <ArrowRight className="h-3.5 w-3.5" /></Link>
            ) : (
              <span className={cn(pagerBtn, 'opacity-40 pointer-events-none')} aria-hidden="true">— <ArrowRight className="h-3.5 w-3.5" /></span>
            )}
          </nav>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
