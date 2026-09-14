// PdfViewer — document viewer in the site's skin. Ported from the
// lawsofexistence.com PdfScrollViewer (PDF.js canvas rendering at exactly the
// pane width: browser-native PDF frames ignore fit-to-width in Safari) with
// the LOE PDFViewer's toolbar (zoom, Download, Open in new tab) and hint bar.
// Rendering is lazy (viewport ± one screen) and off-screen bitmaps are released.
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { cn } from '@/lib/cn';

interface PdfViewerProps {
  src: string;
  title: string;
  /** file name offered by the Download button */
  downloadName?: string;
  /** 'page' (default): the well is one page tall at fit width. 'fill': the
      viewer stretches to its flex parent (review layouts). */
  height?: 'page' | 'fill';
  /** 'standalone' (default): toolbar with the title at its right. 'pane':
      the card sits beside another pane — `leading` (document tabs) takes the
      toolbar's left, the actions compact to the right, and the title drops to
      a one-line sub-bar so the two panes' bodies start level. */
  chrome?: 'standalone' | 'pane';
  /** toolbar-left content in pane chrome (the document tabs) */
  leading?: React.ReactNode;
  /** 'page' height only: a grip under the well lets the reader drag the
      viewer taller or shorter, within the window (owner 2026-09-14: a large
      display should be able to enlarge it in place instead of a new tab). */
  resizable?: boolean;
}

const MAX_BACKING_WIDTH = 3000;
const SETTLE_MS = 150;
const ZOOMS = [60, 75, 90, 100, 125, 150, 200];
type PageMeta = { num: number; aspect: number };

export function PdfViewer({ src, title, downloadName, height = 'page', chrome = 'standalone', leading, resizable = false }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const [zoom, setZoom] = useState(100);
  // reader-set well height (resizable); null = the one-page default
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const renderedWidth = useRef(new Map<number, number>());
  const tasks = useRef(new Map<number, RenderTask>());
  const visible = useRef(new Set<number>());

  // page CSS width = pane width × zoom (100% = fit to width)
  const pageWidth = Math.max(0, Math.floor((paneWidth - 24) * (zoom / 100)));
  // the well is exactly one page tall at fit width (owner 2026-09-09) so the
  // page footer stays in reach; the document scrolls inside the well
  const wellHeight = pages.length && paneWidth ? Math.round((paneWidth - 24) * pages[0].aspect + 24) : 640;

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy(): Promise<void> } | null = null;
    const taskMap = tasks.current, widthMap = renderedWidth.current, visibleSet = visible.current;
    (async () => {
      // reset inside the async tick — the lint rule forbids synchronous
      // setState in an effect body, and a src change is the only trigger
      await Promise.resolve();
      if (cancelled) return;
      setPages([]);
      setError(null);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const task = pdfjs.getDocument({ url: src, standardFontDataUrl: '/pdfjs/standard_fonts/' });
        loadingTask = task;
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        const metas: PageMeta[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
          metas.push({ num: n, aspect: vp.height / vp.width });
          if (cancelled) return;
        }
        setPages(metas);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      taskMap.forEach((t) => t.cancel());
      taskMap.clear(); widthMap.clear(); visibleSet.clear();
      docRef.current = null;
      void loadingTask?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let settle: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => setPaneWidth(el.clientWidth), SETTLE_MS);
    });
    ro.observe(el);
    setPaneWidth(el.clientWidth);
    return () => { clearTimeout(settle); ro.disconnect(); };
  }, []);

  const renderPage = useCallback(async (num: number, cssWidth: number) => {
    const doc = docRef.current, canvas = canvasRefs.current.get(num);
    if (!doc || !canvas || cssWidth <= 0) return;
    if (renderedWidth.current.get(num) === cssWidth) return;
    tasks.current.get(num)?.cancel();
    try {
      const page = await doc.getPage(num);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_BACKING_WIDTH / cssWidth));
      const vp = page.getViewport({ scale: cssWidth / base.width });
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvas, canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      tasks.current.set(num, task);
      await task.promise;
      renderedWidth.current.set(num, cssWidth);
    } catch (e) {
      if (e instanceof Error && e.name === 'RenderingCancelledException') return;
      console.error('PdfViewer: page render failed', num, e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      tasks.current.delete(num);
    }
  }, []);

  useEffect(() => {
    const rootEl = scrollRef.current;
    if (!rootEl || pages.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const num = Number((entry.target as HTMLElement).dataset.page);
        const canvas = canvasRefs.current.get(num);
        if (entry.isIntersecting) {
          visible.current.add(num);
          void renderPage(num, pageWidth);
        } else {
          visible.current.delete(num);
          if (canvas) { canvas.width = 0; canvas.height = 0; renderedWidth.current.delete(num); }
        }
      }
    }, { root: rootEl, rootMargin: '100% 0px' });
    canvasRefs.current.forEach((c) => io.observe(c.parentElement as Element));
    return () => io.disconnect();
  }, [pages, renderPage, pageWidth]);

  useEffect(() => {
    if (pageWidth <= 0) return;
    visible.current.forEach((num) => void renderPage(num, pageWidth));
  }, [pageWidth, renderPage]);

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
  };

  const pane = chrome === 'pane';
  // pane chrome is one notch tighter (h-7 controls in an h-11 bar, like the
  // image pane's header) so the two cards read as a matched pair
  const ctl = pane ? 'h-7 w-7' : 'h-9 w-9';
  const btn = cn(
    'inline-flex items-center gap-1.5 rounded-md text-sm border border-rule bg-card text-ink hover:bg-well transition-colors disabled:opacity-40 disabled:hover:bg-card no-underline shrink-0',
    pane ? 'h-8 px-2.5' : 'h-9 px-3'
  );

  const wellStyle = height === 'fill' ? undefined : { height: userHeight ?? wellHeight };

  // drag the grip: pointer capture, clamped to [320px, window height − chrome]
  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const startY = e.clientY, startH = userHeight ?? wellHeight;
    const maxH = Math.max(320, window.innerHeight - 96);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setUserHeight(Math.round(Math.min(maxH, Math.max(320, startH + (ev.clientY - startY)))));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const wellFill = height === 'fill' ? 'flex-1 min-h-0' : '';
  return (
    <div className={cn('flex flex-col rounded-lg border border-rule bg-card shadow-card overflow-hidden', height === 'fill' && 'h-full')}>
      {/* toolbar */}
      <div className={cn('flex items-center gap-2 px-3 border-b border-rule bg-card no-print', pane ? 'h-11 shrink-0' : 'flex-wrap py-2')}>
        {pane && leading && <div className="flex-1 min-w-0 flex items-center">{leading}</div>}
        <div className={cn('inline-flex items-center rounded-md border border-rule bg-well shrink-0', pane && 'ml-auto')}>
          <button type="button" onClick={() => step(-1)} disabled={zoom === ZOOMS[0]} className={cn(ctl, 'inline-flex items-center justify-center hover:bg-card rounded-l-md disabled:opacity-40')} title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(100)} className={cn(pane ? 'h-7 min-w-[3rem] text-xs' : 'h-9 min-w-[3.75rem] text-sm', 'tabular-nums hover:bg-card')} title="Fit to width">
            {zoom}%
          </button>
          <button type="button" onClick={() => step(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} className={cn(ctl, 'inline-flex items-center justify-center hover:bg-card rounded-r-md disabled:opacity-40')} title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <a href={src} download={downloadName} className={btn} title="Download the PDF" aria-label="Download the PDF">
          <Download className="h-4 w-4" /> <span className={cn(pane && 'hidden xl:inline')}>Download</span>
        </a>
        <a href={src} target="_blank" rel="noopener noreferrer" className={btn} title="Open in new tab" aria-label="Open in new tab">
          <ExternalLink className="h-4 w-4" /> <span className={cn(pane && 'hidden xl:inline')}>{pane ? 'New tab' : 'Open in new tab'}</span>
        </a>
        {!pane && (
          <span className="ml-auto hidden sm:inline text-xs text-muted truncate max-w-[40%]" title={title}>
            {title}
          </span>
        )}
      </div>
      {pane && (
        <div className="h-8 px-3 flex items-center border-b border-rule bg-card/70 text-[11px] text-ink/85 shrink-0" title={title}>
          <div className="min-w-0 truncate w-full" style={{ fontWeight: 550 }}>{title}</div>
        </div>
      )}

      {/* well */}
      {error ? (
        <div className={cn('flex items-center justify-center p-8 text-sm text-muted bg-well', wellFill)} style={wellStyle}>
          <span>
            The document could not be rendered ({error}).{' '}
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">Open the PDF directly</a>.
          </span>
        </div>
      ) : (
        <div ref={scrollRef} className={cn('overflow-auto overscroll-contain bg-well', wellFill)} style={wellStyle}>
          {pages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[16rem]">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-3">
              {pages.map((p) => (
                <div key={p.num} data-page={p.num} className="bg-white shadow-card shrink-0" style={{ width: pageWidth, aspectRatio: `1 / ${p.aspect}` }}>
                  <canvas
                    ref={(el) => { if (el) canvasRefs.current.set(p.num, el); else canvasRefs.current.delete(p.num); }}
                    className="w-full h-auto block"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* resize grip (drag; double-click resets to one page) */}
      {resizable && height === 'page' && !error && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the viewer"
          title="Drag to resize; double-click to reset"
          onPointerDown={onGripDown}
          onDoubleClick={() => setUserHeight(null)}
          className="h-3 shrink-0 cursor-row-resize border-t border-rule bg-card hover:bg-well flex items-center justify-center touch-none select-none"
        >
          <span className="block h-1 w-10 rounded-full bg-rule" />
        </div>
      )}

      {/* hint bar */}
      <div className={cn('flex items-center gap-3 px-3 border-t border-rule text-muted no-print shrink-0', pane ? 'h-8 text-[11px] bg-card/70' : 'py-2 text-xs')}>
        <FileText className="h-3.5 w-3.5 text-accent" />
        <span>PDF</span>
        <span className="text-rule">•</span>
        <span>{pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'}` : 'Loading'}</span>
      </div>
    </div>
  );
}
