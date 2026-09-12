// LeafBody — one archive leaf: the image in a zoom/pan viewer beside its
// reviewer-facing PDFs as tabs. Ported from lawsofexistence.com and re-skinned.
// Stacked (image above, document below) is the default; side-by-side review
// mode on large screens fills the viewport with a draggable divider.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Columns, Rows } from 'lucide-react';
import { type ArchiveDoc, type ArchiveLeafEntry, type ArchiveManifest, archiveBase, imagesPublished } from '@/lib/research-archive';
import { cn } from '@/lib/cn';
import { SiteHeader } from '../../../../_components/SiteHeader';
import { SiteFooter } from '../../../../_components/SiteFooter';
import { LeafImageViewer } from '../../../../_components/LeafImageViewer';
import { PdfViewer } from '../../../../_components/PdfViewer';

type LeafLayout = 'stacked' | 'side';
const LAYOUT_KEY = 'jk-archive-layout';
const SPLIT_KEY = 'jk-archive-split';
const SPLIT_MIN = 25, SPLIT_MAX = 75;

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
    for (const d of leaf.docs) {
      if (seen.has(d.pdf)) continue;
      seen.add(d.pdf);
      t.push({ key: d.pdf, label: d.kind === 'transcript' ? 'Transcript' : d.kind === 'index' ? 'Line index' : `Transcription ${d.span || ''}`.trim(), doc: d });
    }
    return t;
  }, [leaf]);
  const [active, setActive] = useState<string | null>(null);
  const activeTab = tabs.find((t) => t.key === active) || tabs[0] || null;

  const [layout, setLayout] = useState<LeafLayout>('stacked');
  const [split, setSplit] = useState(50);
  const [isLg, setIsLg] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // stored preferences + breakpoint, adopted after hydration
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => setIsLg(mq.matches);
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(LAYOUT_KEY) === 'side') setLayout('side');
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
    setFillHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - 16));
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
  const tog = (on: boolean) => cn('h-7 w-7 inline-flex items-center justify-center rounded', on ? 'bg-accent/20 text-accent-ink' : 'text-muted hover:bg-well');

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className={cn('flex-grow w-full', review ? 'max-w-none px-4 py-6' : 'mx-auto max-w-site px-5 sm:px-8 py-8')}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link href={`/research/${archiveId}`} className="inline-flex items-center text-sm text-muted hover:text-ink no-underline"><ArrowLeft className="h-4 w-4 mr-1.5" />{refLabel} — archive</Link>
          <div className="flex items-center gap-2">
            {prev && <Link href={`/research/${archiveId}/leaf/${prev}`} className="text-sm text-accent-ink inline-flex items-center no-underline"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> {prev}</Link>}
            <span className="font-serif px-2 tabular-nums" style={{ fontWeight: 620 }}>{leafLabel} {leaf.id}</span>
            {next && <Link href={`/research/${archiveId}/leaf/${next}`} className="text-sm text-accent-ink inline-flex items-center no-underline">{next} <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>}
            {openReadings.length > 0 && (
              <Link href={openReadings.length === 1 ? `/research/${openReadings[0].collection}/readings/${openReadings[0].id}` : `/research/${openReadings[0].collection}/readings`} className="ml-2 text-xs uppercase tracking-[0.06em] text-accent-ink border border-accent/40 bg-accent/15 rounded-md px-2 py-0.5 no-underline" style={{ fontWeight: 600 }}>
                {openReadings.length} open reading{openReadings.length === 1 ? '' : 's'} on this leaf
              </Link>
            )}
            <span className="hidden lg:inline-flex items-center gap-0.5 ml-3 bg-card border border-rule rounded-md shadow-card p-0.5">
              <button type="button" className={tog(layout === 'stacked')} onClick={() => changeLayout('stacked')} aria-pressed={layout === 'stacked'} title="Stacked — image above, document below" aria-label="Stacked layout"><Rows className="h-4 w-4" /></button>
              <button type="button" className={tog(layout === 'side')} onClick={() => changeLayout('side')} aria-pressed={layout === 'side'} title="Side by side — image beside document" aria-label="Side-by-side layout"><Columns className="h-4 w-4" /></button>
            </span>
          </div>
        </div>

        <div ref={rowRef}
          className={cn('grid grid-cols-1 gap-6', review ? 'items-stretch lg:gap-0' : 'items-start', layout !== 'side' && 'max-w-4xl mx-auto')}
          style={review && fillHeight ? { height: fillHeight, gridTemplateColumns: `${split}% 14px minmax(0, 1fr)` } : undefined}>
          {/* leaf image */}
          <div className={cn(review && 'h-full min-h-0 flex flex-col')}>
            <div className={cn(review && 'flex-1 min-h-0')}>
              <LeafImageViewer key={`${layout}-${review ? 'review' : 'page'}`}
                src={`${archiveBase(archiveId)}/${leaf.web ?? leaf.image}`}
                alt={`${refLabel} ${leafLabel.toLowerCase()} ${leaf.id}`}
                heightClass={review ? 'flex-1 min-h-0' : layout === 'stacked' ? 'h-[56vh] lg:h-[64vh]' : 'h-[62vh]'}
                fitMode={imagesPublished(manifest) ? 'width' : 'contain'} />
            </div>
            {imagesPublished(manifest) ? (
              <div className="mt-2 text-[11px] text-muted leading-relaxed space-y-0.5">
                {leaf.credit && (
                  <p>
                    {leaf.credit}
                    {manifest.images?.creditUrl && <> · <a href={manifest.images.creditUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">{manifest.images.creditUrl.replace(/^https?:\/\//, '')}</a></>}
                  </p>
                )}
                {leaf.web && <p>Shown at web resolution — the fixity hash below is the original&rsquo;s.</p>}
                <p>
                  <a href={`${archiveBase(archiveId)}/${leaf.image}`} download className="underline text-accent-ink" style={{ fontWeight: 550 }}>
                    Download the full-resolution original{leaf.imageBytes ? ` (${Math.round(leaf.imageBytes / 1e6)} MB)` : ''}
                  </a>{' '}— for private study and non-commercial research.
                </p>
                {leaf.sha256 && <p className="font-mono break-all">sha256 {leaf.sha256}</p>}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted leading-relaxed">Placeholder — the leaf image awaits a reproduction licence from {manifest.images?.rightsHolder || 'the rights holder'}.</p>
            )}
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
            {tabs.length === 0 ? (
              <div className="bg-card border border-rule rounded-lg shadow-card p-8 text-sm text-muted">No line index or transcription PDF has been published for this leaf yet.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {tabs.map((t) => (
                    <button key={t.key} type="button" onClick={() => setActive(t.key)}
                      className={cn('px-3 py-1.5 rounded-md text-sm transition-colors', activeTab?.key === t.key ? 'bg-ink text-on-ink shadow-card' : 'bg-card text-ink/80 hover:bg-well border border-rule')}
                      style={{ fontWeight: activeTab?.key === t.key ? 600 : 500 }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {activeTab && <p className="text-sm leading-snug mb-3 text-ink/85" style={{ fontWeight: 550 }}>{activeTab.doc.title}</p>}
                {pdfUrl && (
                  <div className={cn(review && 'flex-1 min-h-0')}>
                    <PdfViewer key={pdfUrl} src={pdfUrl} title={activeTab!.doc.title} downloadName={pdfUrl.split('/').pop()} height={review ? 'fill' : 'page'} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
