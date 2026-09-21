// PdfViewer — document viewer in the site's skin. Ported from the
// lawsofexistence.com PdfScrollViewer (PDF.js canvas rendering at exactly the
// pane width: browser-native PDF frames ignore fit-to-width in Safari) with
// the LOE PDFViewer's toolbar (zoom, Download, Open in new tab) and hint bar.
// Rendering is lazy (viewport ± one screen) and off-screen bitmaps are released.
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, ExternalLink, FileText, Loader2, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { cn } from '@/lib/cn';

/** a clickable box over the page — PDF points, origin top-left, `page` 1-based */
export interface PdfHotBox { id: string; page: number; rect: [number, number, number, number]; kind?: 'unit' | 'marker'; title?: string }
/** scroll so that `y` (PDF points from the top of `page`, 1-based) is near the top of the well; a new `nonce` re-fires */
export interface PdfFocus { page: number; y: number; nonce: number }

interface PdfViewerProps {
  src: string;
  title: string;
  /** the file's size when known: a file under RANGE_MIN_BYTES is fetched whole (one request beats a
      dozen 0.3 s round trips), a larger one by 1 MB ranges */
  bytes?: number;
  /** the file the Download / New-tab buttons serve when it differs from `src` (a copy with link annotations) */
  downloadSrc?: string;
  /** transparent hit boxes laid over the pages (review mode: the book's citations) */
  hotBoxes?: PdfHotBox[];
  activeHot?: string | null;
  onHot?: (box: PdfHotBox) => void;
  focus?: PdfFocus | null;
  /** pages (1-based) to mark in the margin — review mode: the cited pages within a reading copy */
  markedPages?: number[];
  /** 'top' (default) or 'bottom': where the zoom / Download / New-tab bar sits (standalone chrome;
      the home-page CV viewer puts it under the document, owner 2026-09-15) */
  toolbar?: 'top' | 'bottom';
  /** the page in hand among the marked ones */
  currentPage?: number | null;
  /** fires with the page (1-based) under the well's reading line as the reader scrolls */
  onPageInView?: (page: number) => void;
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
  /** a grip at the card's top-right corner scales the whole viewer: the
      reader drags it outward and the card widens, the page refits to the new
      width, and the well grows with it, so the text gets bigger in place
      (owner 2026-09-14). The parent owns the width (`scaleWidth`) so it can
      give the viewer the full row when it outgrows its column. */
  resizable?: boolean;
  scaleWidth?: number | null;
  onScale?: (width: number | null) => void;
}

const MAX_BACKING_WIDTH = 2400;
type PdfjsModule = typeof import('pdfjs-dist');
let workerSingleton: InstanceType<PdfjsModule['PDFWorker']> | null = null;
function sharedWorker(pdfjs: PdfjsModule) {
  if (!workerSingleton || workerSingleton.destroyed) workerSingleton = new pdfjs.PDFWorker(); // the typings admit no name
  return workerSingleton;
}
const SETTLE_MS = 150;
const ZOOMS = [60, 75, 90, 100, 125, 150, 200];
type PageMeta = { num: number; aspect: number; w: number; h: number };

// ---- search within the pane (owner 2026-09-15: "add the ability to search within each pane") -------
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MAX_HITS = 1000;
/** one text item of a page: its character range in the page's joined text and its baseline geometry in
    PDF user space — (x, y) the baseline start, (dx, dy) the unit baseline direction, w the advance, h the size */
type TextSpan = { start: number; end: number; x: number; y: number; dx: number; dy: number; w: number; h: number };
type PageText = { norm: string; spans: TextSpan[]; toViewport: (x: number, y: number) => [number, number]; width: number; height: number };
/** a match: its page and the boxes that cover it, as FRACTIONS of the page (origin top-left) so they ride every zoom and need no page size */
type SearchHit = { page: number; boxes: [number, number, number, number][] };
/** fold a character for matching — case and accents dropped, one character in → one character out, so offsets hold */
function foldChar(ch: string): string {
  if (ch === '\n' || ch === '\u00a0' || ch === '\t') return ' ';
  const d = ch.normalize('NFD');
  const base = d[0] ?? ch;
  if (/\p{M}/u.test(ch)) return '\u0001'; // a lone combining mark: never matches
  return base.toLowerCase();
}
function foldText(t: string): string { let o = ''; for (const ch of t) o += foldChar(ch); return o; }

const RANGE_MIN_BYTES = 3 * 1024 * 1024;
const RANGE_CHUNK = 1024 * 1024;

export function PdfViewer({ src, title, bytes, downloadSrc, downloadName, height = 'page', chrome = 'standalone', leading, resizable = false, scaleWidth = null, onScale, hotBoxes, activeHot = null, onHot, focus = null, markedPages, currentPage = null, onPageInView, toolbar = 'top' }: PdfViewerProps) {
  const marked = React.useMemo(() => new Set(markedPages ?? []), [markedPages]);
  const fileHref = downloadSrc ?? src;
  // hit boxes by page, positioned as percentages of the page box so they ride every zoom
  const hotByPage = React.useMemo(() => {
    const m = new Map<number, PdfHotBox[]>();
    for (const b of hotBoxes ?? []) (m.get(b.page) ?? m.set(b.page, []).get(b.page)!).push(b);
    return m;
  }, [hotBoxes]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appliedFocus = useRef<number | null>(null); // nonce of the focus last scrolled to (see the focus effect)
  const readerMoved = useRef(false); // the reader scrolled by hand since that focus
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  const [zoom, setZoom] = useState(100);
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
    const taskMap = tasks.current, widthMap = renderedWidth.current, visibleSet = visible.current, pendingMap = pending.current, wantedMap = wanted.current, restartMap = restarts.current;
    const textMap = textCache.current, genBox = searchGen;
    (async () => {
      // reset inside the async tick — the lint rule forbids synchronous
      // setState in an effect body, and a src change is the only trigger
      await Promise.resolve();
      if (cancelled) return;
      setPages([]);
      setError(null);
      appliedFocus.current = null; // a new document takes the current focus afresh
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        // LOADING (owner 2026-09-15, "serious trouble loading"): the served files are linearized at
        // import and Netlify answers byte ranges, so the viewer fetches only the chunks the visible
        // pages need — never the whole file up front (a 16 MB case, a 3 MB register). One worker is
        // shared by every viewer on the page instead of a fresh one per document.
        const task = pdfjs.getDocument({
          url: src, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
          // measured on the live CDN 2026-09-15: ~0.3 s per range round trip, ~2.4 MB/s in one stream —
          // so a file under 3 MB is fastest whole, and a big one in 1 MB chunks
          ...(bytes !== undefined && bytes < RANGE_MIN_BYTES
            ? { disableRange: true, disableStream: false, disableAutoFetch: false }
            : { disableAutoFetch: true, disableStream: true, rangeChunkSize: RANGE_CHUNK }),
          worker: sharedWorker(pdfjs),
        });
        loadingTask = task;
        const doc = await task.promise;
        if (cancelled) return;
        docRef.current = doc;
        // page sizes: read the FIRST page and assume its shape for the rest (books and reporters
        // are uniform); each page's true size is read when it is rendered. Reading every page's
        // dictionary before the first paint cost a round trip per page on long documents.
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        const metas: PageMeta[] = [];
        for (let n = 1; n <= doc.numPages; n++) metas.push({ num: n, aspect: first.height / first.width, w: first.width, h: first.height });
        setPages(metas);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      taskMap.forEach((t) => t.cancel());
      taskMap.clear(); widthMap.clear(); visibleSet.clear(); pendingMap.clear(); wantedMap.clear(); restartMap.clear();
      textMap.clear(); genBox.current++; // a new document: forget the old text layer, stop a search in flight
      docRef.current = null;
      void loadingTask?.destroy();
    };
  }, [src, bytes]);

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

  // one render at a time per page: a new request for a page whose render is still in flight
  // cancels it and WAITS for the cancellation to settle before drawing again — pdf.js refuses a
  // second render() on a canvas until the first has finished or been cancelled ("Cannot use the
  // same canvas during multiple render() operations", seen by the owner 2026-09-15 when a resize
  // and the page-size correction fired together). The latest request wins; a superseded one
  // simply returns. A per-page failure is logged and retried once, never shown as the whole
  // document failing.
  const pending = useRef(new Map<number, Promise<void>>());
  const wanted = useRef(new Map<number, number>()); // page → the css width last asked for
  const restarts = useRef(new Map<number, number>()); // page → chains restarted by the tail without a draw landing

  // search state — see the SEARCH block above the component
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIdx, setHitIdx] = useState(0);
  const [searching, setSearching] = useState<{ page: number; of: number } | null>(null);
  const [textless, setTextless] = useState(false); // the pass found no text layer at all
  const textCache = useRef(new Map<number, PageText>());
  const searchGen = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const renderPage = useCallback((num: number, cssWidth: number) => {
    const doc = docRef.current, canvas = canvasRefs.current.get(num);
    if (!doc || !canvas || cssWidth <= 0) return;
    if (renderedWidth.current.get(num) === cssWidth && canvas.width > 0 && !tasks.current.has(num)) return;
    // A chain already drawing THIS width is left alone. Cancelling it was the owner's "the page you are
    // viewing gets stuck until you scroll up and down" (2026-09-15): the IntersectionObserver is rebuilt
    // whenever a page's true size corrects the layout, and a rebuilt observer reports every visible page
    // again at the same width — the cancel then landed on a half-drawn canvas that nothing redrew until
    // the page left the viewport and came back. Only a NEW width interrupts a draw in flight.
    if (pending.current.has(num)) {
      if (wanted.current.get(num) !== cssWidth) { wanted.current.set(num, cssWidth); tasks.current.get(num)?.cancel(); }
      return; // the chain below re-reads `wanted`
    }
    wanted.current.set(num, cssWidth);
    const run = (async () => {
      let attempt = 0, blankRedraws = 0;
      // loop while a newer width was requested during the render, or a draw was cancelled before it landed
      for (;;) {
        const width = wanted.current.get(num);
        const cv = canvasRefs.current.get(num);
        if (!docRef.current || !cv || !width) return;
        // a page marked rendered whose canvas is empty was cleared while it was off-screen: draw again
        if (renderedWidth.current.get(num) === width && cv.width > 0) return;
        try {
          const page = await docRef.current.getPage(num);
          const base = page.getViewport({ scale: 1 });
          // correct the assumed size once the page is in hand (a plate, a fold-out, a different volume)
          setPages((prev) => {
            const cur = prev.find((p) => p.num === num);
            if (!cur || (Math.abs(cur.w - base.width) < 0.5 && Math.abs(cur.h - base.height) < 0.5)) return prev;
            return prev.map((p) => (p.num === num ? { num, aspect: base.height / base.width, w: base.width, h: base.height } : p));
          });
          const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_BACKING_WIDTH / width));
          const vp = page.getViewport({ scale: width / base.width });
          cv.width = Math.floor(vp.width * dpr);
          cv.height = Math.floor(vp.height * dpr);
          const ctx = cv.getContext('2d');
          if (!ctx) return;
          const task = page.render({ canvas: cv, canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
          tasks.current.set(num, task);
          let landed = false;
          try {
            await task.promise;
            // the page may have scrolled out (canvas cleared) while this drew — never mark a blank canvas
            // as rendered, or it would stay blank when it scrolls back (the owner's "some pages give up",
            // 2026-09-15)
            if (visible.current.has(num) && cv.width > 0) { renderedWidth.current.set(num, width); landed = true; restarts.current.delete(num); }
            else { renderedWidth.current.delete(num); if (!visible.current.has(num)) { cv.width = 0; cv.height = 0; } }
          }
          catch (e) { if (!(e instanceof Error && e.name === 'RenderingCancelledException')) throw e; }
          finally { tasks.current.delete(num); }
          if (!visible.current.has(num)) return; // scrolled away: the exit handler cleared the canvas; re-entry redraws
          if (landed && wanted.current.get(num) === width) return; // drawn at the width still wanted
          // cancelled before it landed (or a newer width arrived): draw again — a sized canvas with a
          // half-finished draw on it is NOT a rendered page
        } catch (e) {
          if (++attempt > 1) { console.error('PdfViewer: page render failed', num, e); return; }
          await new Promise((r) => setTimeout(r, 120)); // let a colliding render settle, then try once more
          continue;
        }
        if (++blankRedraws > 4) return; // never spin on a canvas something keeps clearing
      }
    })();
    pending.current.set(num, run);
    void run.finally(() => {
      if (pending.current.get(num) !== run) return;
      pending.current.delete(num);
      // the tail: a chain that ended while the page is on screen and not drawn at the wanted width
      // (a re-entry that raced the chain's exit) starts one more, bounded so a failing page cannot spin
      const w = wanted.current.get(num);
      if (w && visible.current.has(num) && (renderedWidth.current.get(num) !== w || (canvasRefs.current.get(num)?.width ?? 0) === 0)) {
        const n = (restarts.current.get(num) ?? 0) + 1;
        restarts.current.set(num, n);
        if (n <= 3) renderPage(num, w);
      }
    });
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
          restarts.current.delete(num);
          tasks.current.get(num)?.cancel();
          if (canvas) { canvas.width = 0; canvas.height = 0; renderedWidth.current.delete(num); }
        }
      }
      // one screen of margin either side: enough to have the next page ready, few enough live
      // canvases to stay inside Safari's canvas-memory budget with two panes open
    }, { root: rootEl, rootMargin: '60% 0px' });
    canvasRefs.current.forEach((c) => io.observe(c.parentElement as Element));
    return () => io.disconnect();
  }, [pages, renderPage, pageWidth]);

  useEffect(() => {
    if (pageWidth <= 0) return;
    visible.current.forEach((num) => void renderPage(num, pageWidth));
  }, [pageWidth, renderPage]);

  // which page is under the reading line (a third of the way down the well) — reported as it changes
  const inViewRef = useRef<number | null>(null);
  const onPageInViewRef = useRef(onPageInView);
  useEffect(() => { onPageInViewRef.current = onPageInView; }, [onPageInView]);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !onPageInView || pages.length === 0) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = root.scrollTop + root.clientHeight * 0.33;
      let best: number | null = null;
      for (const el of root.querySelectorAll<HTMLElement>('[data-page]')) {
        if (el.offsetTop <= line && el.offsetTop + el.offsetHeight > line) { best = Number(el.dataset.page); break; }
      }
      if (best != null && best !== inViewRef.current) { inViewRef.current = best; onPageInViewRef.current?.(best); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { root.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [pages, !!onPageInView]); // eslint-disable-line react-hooks/exhaustive-deps -- the callback is read through the ref

  // scroll the well so the focused point sits a little below the top — ONCE per focus. `pages` is also
  // a dependency because a page's assumed size is corrected when it renders, which moves the target;
  // that correction is followed only while the reader has not moved. Before, every correction (each
  // newly rendered page below, as the reader scrolled) re-ran the smooth scroll back to the cited page
  // — the owner's "the pane jumps back up when you try to scroll down" (2026-09-15). `pageWidth` is a
  // dependency for the same reason: a focus applied at load, before the side-by-side pane has its
  // measured width, lands on the pages' first layout; the refit that follows grows every page and the
  // target moves down the well (leaf 004 opened with page 5's top 440px down instead of 72, 2026-09-21).
  // A width change re-settles the scroll on the target — again only while the reader has not moved.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const mark = () => { readerMoved.current = true; };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((e) => root.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => root.removeEventListener(e, mark));
  }, []);
  useEffect(() => {
    const root = scrollRef.current;
    if (!focus || !root || pages.length === 0) return;
    const fresh = appliedFocus.current !== focus.nonce;
    if (!fresh && readerMoved.current) return; // the reader has moved on: a size correction must not pull them back
    const el = root.querySelector<HTMLElement>(`[data-page="${focus.page}"]`);
    const meta = pages.find((p) => p.num === focus.page);
    if (!el || !meta) return;
    const top = Math.max(0, el.offsetTop + (focus.y / meta.h) * el.offsetHeight - 72);
    inViewRef.current = focus.page; // the programmatic scroll is not a reader's move
    if (fresh) {
      // the first focus on a freshly loaded document jumps: the reader has not seen page 1, so there is
      // nothing to animate from (and an animation begun before the pane's refit lands short — the leaf
      // pages, 2026-09-21); a later focus on the same document (the next citation) glides
      const firstOnDoc = appliedFocus.current === null;
      appliedFocus.current = focus.nonce;
      readerMoved.current = false;
      root.scrollTo({ top, behavior: firstOnDoc ? 'auto' : 'smooth' });
    } else if (Math.abs(root.scrollTop - top) > 2) {
      root.scrollTo({ top, behavior: 'auto' }); // the target moved under a size correction or a refit: settle on it without a second animation
    }
  }, [focus, pages, pageWidth]);

  // ---- search ----
  // a page's text layer, read once: pdf.js text items joined in reading order, folded for matching,
  // each item keeping its baseline geometry so a hit can be boxed at the characters it covers
  const readPageText = useCallback(async (num: number): Promise<PageText | null> => {
    const cached = textCache.current.get(num);
    if (cached) return cached;
    const doc = docRef.current;
    if (!doc) return null;
    const page = await doc.getPage(num);
    const vp = page.getViewport({ scale: 1 });
    // read the text layer through streamTextContent + a plain reader loop: getTextContent() drives its
    // stream with `for await`, and WebKit (Safari, the Studio shell) has no async iteration on
    // ReadableStream — every page threw "undefined is not a function" and the book read as textless
    const reader = page.streamTextContent({ includeMarkedContent: false }).getReader();
    const items: Awaited<ReturnType<typeof page.getTextContent>>['items'] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      items.push(...value.items);
    }
    let text = '';
    const spans: TextSpan[] = [];
    for (const it of items) {
      if (!('str' in it)) continue;
      const str = it.str;
      if (str.length) {
        const [a, b, , , e, f] = it.transform;
        const len = Math.hypot(a, b) || 1;
        spans.push({ start: text.length, end: text.length + str.length, x: e, y: f, dx: a / len, dy: b / len, w: it.width, h: it.height || len });
        text += str;
      }
      if (it.hasEOL) text += '\n';
    }
    const pt: PageText = { norm: foldText(text), spans, toViewport: (x, y) => vp.convertToViewportPoint(x, y) as [number, number], width: vp.width, height: vp.height };
    textCache.current.set(num, pt);
    return pt;
  }, []);

  // the boxes of one match on one page: for every item the match touches, the slice of its baseline
  // the matched characters cover, lifted to a box (0.25 of the size below the baseline, 0.8 above),
  // mapped through the page's viewport (so a rotated page still boxes right) and kept as fractions
  const boxesFor = (pt: PageText, s: number, e: number): [number, number, number, number][] => {
    const out: [number, number, number, number][] = [];
    for (const sp of pt.spans) {
      if (sp.end <= s || sp.start >= e) continue;
      const n = sp.end - sp.start;
      const t0 = (Math.max(s, sp.start) - sp.start) / n, t1 = (Math.min(e, sp.end) - sp.start) / n;
      const ux = -sp.dy, uy = sp.dx; // up, perpendicular to the baseline
      const pts: [number, number][] = [];
      for (const t of [t0, t1]) {
        const bx = sp.x + sp.dx * sp.w * t, by = sp.y + sp.dy * sp.w * t;
        pts.push(pt.toViewport(bx - ux * sp.h * 0.25, by - uy * sp.h * 0.25));
        pts.push(pt.toViewport(bx + ux * sp.h * 0.8, by + uy * sp.h * 0.8));
      }
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      out.push([Math.min(...xs) / pt.width, Math.min(...ys) / pt.height, Math.max(...xs) / pt.width, Math.max(...ys) / pt.height]);
    }
    return out;
  };

  const runSearch = useCallback(async (raw: string) => {
    const gen = ++searchGen.current;
    const q = foldText(raw).replace(/\s+/g, ' ').trim();
    setHits([]); setHitIdx(0); setTextless(false);
    if (q.length < SEARCH_MIN_CHARS || !docRef.current) { setSearching(null); return; }
    const total = docRef.current.numPages;
    const found: SearchHit[] = [];
    let withText = 0;
    for (let n = 1; n <= total; n++) {
      if (searchGen.current !== gen) return; // a newer query or a new document
      setSearching({ page: n, of: total });
      let pt: PageText | null = null;
      try { pt = await readPageText(n); } catch (e) { console.warn('PdfViewer: text layer unreadable on page', n, e); pt = null; }
      if (searchGen.current !== gen) return;
      if (pt && pt.norm.trim().length) withText++;
      if (pt) {
        let i = pt.norm.indexOf(q);
        while (i !== -1 && found.length < SEARCH_MAX_HITS) {
          found.push({ page: n, boxes: boxesFor(pt, i, i + q.length) });
          i = pt.norm.indexOf(q, i + 1);
        }
      }
      if (n % 20 === 0) setHits(found.slice());
      if (found.length >= SEARCH_MAX_HITS) break;
    }
    if (searchGen.current !== gen) return;
    setHits(found);
    setTextless(withText === 0);
    setSearching(null);
  }, [readPageText]);

  // debounce the typed query; re-run when the document lands (a query typed while it loads)
  const docReady = pages.length > 0;
  useEffect(() => {
    if (!searchOpen || !docReady) return;
    const t = setTimeout(() => { void runSearch(query); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, searchOpen, docReady, runSearch]);

  // hits by page, and the current hit's position on its page
  const hitsByPage = React.useMemo(() => {
    const m = new Map<number, { idx: number; boxes: SearchHit['boxes'] }[]>();
    hits.forEach((h, idx) => (m.get(h.page) ?? m.set(h.page, []).get(h.page)!).push({ idx, boxes: h.boxes }));
    return m;
  }, [hits]);

  // scroll the well to the current hit — a third of the way down, like a citation focus
  const gotoHit = useCallback((idx: number) => {
    const root = scrollRef.current, h = hits[idx];
    if (!root || !h) return;
    const el = root.querySelector<HTMLElement>(`[data-page="${h.page}"]`);
    if (!el) return;
    const fy = h.boxes.length ? Math.min(...h.boxes.map((b) => b[1])) : 0;
    inViewRef.current = h.page;
    readerMoved.current = true; // a hit walk is the reader's move: a later size correction must not pull back to the citation
    root.scrollTo({ top: Math.max(0, el.offsetTop + fy * el.offsetHeight - root.clientHeight * 0.33), behavior: 'smooth' });
  }, [hits]);
  const stepHit = (dir: 1 | -1) => {
    if (!hits.length) return;
    const next = (hitIdx + dir + hits.length) % hits.length;
    setHitIdx(next);
    gotoHit(next);
  };
  // the first hit of a fresh result set is brought into view once
  const shownFor = useRef<SearchHit[] | null>(null);
  useEffect(() => {
    if (hits.length && shownFor.current !== hits && !searching) { shownFor.current = hits; gotoHit(0); }
  }, [hits, searching, gotoHit]);

  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchInput.current?.select(), 0); };
  const closeSearch = () => { searchGen.current++; setSearchOpen(false); setQuery(''); setHits([]); setHitIdx(0); setSearching(null); setTextless(false); };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  };
  const searchStatus = searching ? `page ${searching.page} of ${searching.of}`
    : query.trim().length < SEARCH_MIN_CHARS ? ''
    : textless ? 'no text layer in this document'
    : hits.length === 0 ? 'no matches'
    : `${hitIdx + 1} of ${hits.length >= SEARCH_MAX_HITS ? `${SEARCH_MAX_HITS}+` : hits.length}`;

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
  };

  const pane = chrome === 'pane';
  // pane chrome is one notch tighter (h-7 controls in an h-11 bar, like the
  // image pane's header) so the two cards read as a matched pair
  // full-size controls are 44-px targets on phones and tablets (device run 2026-09-15); from lg the 36-px desktop size
  const ctl = pane ? 'h-7 w-7' : 'h-11 w-11 lg:h-9 lg:w-9';
  const btn = cn(
    'inline-flex items-center gap-1.5 rounded-md text-sm border border-rule bg-card text-ink hover:bg-well transition-colors disabled:opacity-40 disabled:hover:bg-card no-underline shrink-0',
    pane ? 'h-8 px-2.5' : 'h-11 lg:h-9 px-3'
  );

  const wellStyle = height === 'fill' ? undefined : { height: wellHeight };

  // corner grip: drag up-and-right to grow, down-and-left to shrink; the
  // parent clamps and lays the card out at the requested width
  const cardRef = useRef<HTMLDivElement>(null);
  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onScale) return;
    const startX = e.clientX, startY = e.clientY, startW = cardRef.current?.getBoundingClientRect().width ?? 0;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onScale(Math.round(Math.max(360, startW + (ev.clientX - startX) - (ev.clientY - startY))));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const wellFill = height === 'fill' ? 'flex-1 min-h-0' : '';
  const bottom = toolbar === 'bottom' && !pane;
  // the document actions — zoom · Download · New tab; the standalone chrome carries them in its
  // toolbar (top or bottom), the pane chrome in its footer bar under the well (owner 2026-09-15)
  const actions = (
    <>
        <div className={cn('inline-flex items-center rounded-md border border-rule bg-well shrink-0', pane && 'ml-auto')}>
          <button type="button" onClick={() => step(-1)} disabled={zoom === ZOOMS[0]} className={cn(ctl, 'inline-flex items-center justify-center hover:bg-card rounded-l-md disabled:opacity-40')} title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(100)} className={cn(pane ? 'h-7 min-w-[3rem] text-xs' : 'h-11 lg:h-9 min-w-[3.75rem] text-sm', 'tabular-nums hover:bg-card')} title="Fit to width">
            {zoom}%
          </button>
          <button type="button" onClick={() => step(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} className={cn(ctl, 'inline-flex items-center justify-center hover:bg-card rounded-r-md disabled:opacity-40')} title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <a href={fileHref} download={downloadName} className={btn} title="Download the PDF" aria-label="Download the PDF">
          <Download className="h-4 w-4" /> <span className={cn(pane && 'hidden xl:inline')}>Download</span>
        </a>
        <a href={fileHref} target="_blank" rel="noopener noreferrer" className={btn} title="Open in new tab" aria-label="Open in new tab">
          <ExternalLink className="h-4 w-4" /> <span className={cn(pane && 'hidden xl:inline')}>{pane ? 'New tab' : 'Open in new tab'}</span>
        </a>
    </>
  );
  // the magnifier: opens the search row (pane header at the right; standalone toolbar beside the actions)
  const searchButton = (
      <button type="button" onClick={searchOpen ? closeSearch : openSearch} aria-pressed={searchOpen} aria-label="Search in this document" title="Search in this document"
        className={cn('inline-flex items-center justify-center rounded-md border transition-colors shrink-0', pane ? 'ml-auto h-8 w-8' : 'h-11 w-11 lg:h-9 lg:w-9',
          searchOpen ? 'border-accent/40 bg-accent/15 text-accent-ink' : 'border-rule bg-card text-ink hover:bg-well')}>
        <Search className="h-4 w-4" />
      </button>
  );
  const toolbarBar = (
      <div className={cn('flex items-center gap-2 px-3 bg-card no-print flex-wrap py-2', bottom ? 'border-t border-rule' : 'border-b border-rule')}>
        {actions}
        {searchButton}
        <span className="ml-auto hidden sm:inline text-xs text-muted truncate max-w-[40%]" title={title}>
          {title}
        </span>
      </div>
  );
  // pane chrome: the h-11 header bar carries only the pane's own controls (citation stepper, text link)
  const paneHeader = (
      <div className="flex items-center gap-2 px-3 bg-card border-b border-rule h-11 shrink-0 no-print">
        {leading && <div className="flex-1 min-w-0 flex items-center">{leading}</div>}
        {searchButton}
      </div>
  );
  // the search row — the query, its status, prev / next, close; sits over the well in either chrome
  const sctl = cn(ctl, 'inline-flex items-center justify-center hover:bg-card disabled:opacity-40');
  const searchRow = searchOpen && (
      <div className="flex items-center gap-2 px-3 h-10 border-b border-rule bg-card shrink-0 no-print" role="search">
        <Search className="h-3.5 w-3.5 text-muted shrink-0" aria-hidden />
        <input ref={searchInput} type="search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} autoFocus
          placeholder="Search this document" aria-label="Search this document" autoComplete="off" spellCheck={false}
          className="flex-1 min-w-0 h-7 bg-transparent text-sm text-ink placeholder:text-muted outline-none" />
        <span className="text-xs text-muted tabular-nums whitespace-nowrap shrink-0" aria-live="polite">
          {searching ? <Loader2 className="inline h-3 w-3 animate-spin mr-1 align-[-1px]" aria-hidden /> : null}{searchStatus}
        </span>
        <span className="inline-flex items-center rounded-md border border-rule bg-well shrink-0">
          <button type="button" onClick={() => stepHit(-1)} disabled={hits.length === 0} className={cn(sctl, 'rounded-l-md')} title="Previous match (Shift+Enter)" aria-label="Previous match"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => stepHit(1)} disabled={hits.length === 0} className={cn(sctl, 'rounded-r-md border-l border-rule')} title="Next match (Enter)" aria-label="Next match"><ChevronDown className="h-4 w-4" /></button>
        </span>
        <button type="button" onClick={closeSearch} className={sctl} title="Close search (Esc)" aria-label="Close search"><X className="h-4 w-4" /></button>
      </div>
  );
  return (
    <div ref={cardRef} className={cn('relative flex flex-col rounded-lg border border-rule bg-card shadow-card overflow-hidden', height === 'fill' && 'h-full')} style={scaleWidth ? { width: scaleWidth, maxWidth: '100%' } : undefined}>
      {resizable && height === 'page' && (
        <div
          role="separator"
          aria-label="Resize the viewer"
          title="Drag the corner to resize; double-click to reset"
          onPointerDown={onGripDown}
          onDoubleClick={() => onScale?.(null)}
          className="absolute top-0 right-0 z-10 h-5 w-5 cursor-nesw-resize touch-none select-none"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-accent" aria-hidden><path d="M8 3h9v9M12 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </div>
      )}
      {/* toolbar (standalone chrome, top or bottom) · the pane chrome's header bar */}
      {pane ? paneHeader : !bottom && toolbarBar}
      {pane && (
        <div className="h-8 px-3 flex items-center border-b border-rule bg-card/70 text-[11px] text-ink/85 shrink-0" title={title}>
          <div className="min-w-0 truncate w-full" style={{ fontWeight: 550 }}>{title}</div>
        </div>
      )}
      {/* search row (owner 2026-09-15: search within each pane) */}
      {searchRow}

      {/* well */}
      {error ? (
        <div className={cn('flex items-center justify-center p-8 text-sm text-muted bg-well', wellFill)} style={wellStyle}>
          <span>
            The document could not be rendered ({error}).{' '}
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">Open the PDF directly</a>.
          </span>
        </div>
      ) : (
        <div ref={scrollRef} className={cn('relative overflow-auto overscroll-contain bg-well', wellFill)} style={wellStyle}>
          {pages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[16rem]">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-3">
              {pages.map((p) => (
                <div key={p.num} data-page={p.num} className={cn('relative bg-white shadow-card shrink-0', marked.has(p.num) && 'pdf-page-cited', currentPage === p.num && 'pdf-page-current')} style={{ width: pageWidth, aspectRatio: `1 / ${p.aspect}` }}>
                  {marked.has(p.num) && <span className="pdf-page-tag">{currentPage === p.num ? 'cited page' : 'cited'}</span>}
                  <canvas
                    ref={(el) => { if (el) canvasRefs.current.set(p.num, el); else canvasRefs.current.delete(p.num); }}
                    className="w-full h-auto block"
                  />
                  {hitsByPage.get(p.num)?.map((h) => h.boxes.map((b, j) => (
                    <span key={`s${h.idx}-${j}`} aria-hidden className={cn('pdf-search-hit', h.idx === hitIdx && 'pdf-search-hit-current')}
                      style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` }} />
                  )))}
                  {hotByPage.get(p.num)?.map((b, i) => {
                    const [x0, y0, x1, y1] = b.rect;
                    return (
                      <button
                        key={`${b.id}-${i}`}
                        type="button"
                        data-hot={b.id}
                        title={b.title}
                        aria-label={b.title ?? b.id}
                        onClick={() => onHot?.(b)}
                        className={cn('pdf-hot', b.kind === 'marker' && 'pdf-hot-marker', activeHot === b.id && 'pdf-hot-active')}
                        style={{ left: `${(x0 / p.w) * 100}%`, top: `${(y0 / p.h) * 100}%`, width: `${((x1 - x0) / p.w) * 100}%`, height: `${((y1 - y0) / p.h) * 100}%` }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!pane && bottom && toolbarBar}

      {/* hint bar — the document's record; in the pane chrome it is an h-11 footer that also carries
          zoom · Download · New tab at its right (owner 2026-09-15: the actions moved under the well;
          both panes share this component so their edges stay level) */}
      <div className={cn('flex items-center gap-2 px-3 border-t border-rule no-print shrink-0', pane ? 'h-11 bg-card/70' : 'py-2')}>
        <div className={cn('flex items-center gap-3 text-muted min-w-0 truncate', pane ? 'text-[11px]' : 'text-xs')}>
          <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
          <span>PDF</span>
          <span className="text-rule">•</span>
          <span>{pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'}` : 'Loading'}</span>
        </div>
        {pane && actions}
      </div>
    </div>
  );
}
