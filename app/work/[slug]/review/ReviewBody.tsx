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
import { AlignLeft, ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Columns, CornerLeftUp, ExternalLink, FileText, Image as ImageIcon, Loader2, Lock, Rows, ScrollText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RIGHTS_LABEL, WORK_URL_KIND, citeFromHash, hashForCite, leafFromUrl, type EditionMap, type ReviewManifest, type ReviewUnit, type ReviewWork } from '@/lib/review';
import { Md } from '../../../_components/Markdown';
import { SiteHeader } from '../../../_components/SiteHeader';
import { SiteFooter } from '../../../_components/SiteFooter';
import { PdfViewer, type PdfFocus, type PdfHotBox } from '../../../_components/PdfViewer';
import { LeafImageViewer } from '../../../_components/LeafImageViewer';

type Layout = 'stacked' | 'side';
const LAYOUT_KEY = 'jk-review-layout';
const MODE_KEY = 'jk-review-mode';
type Mode = 'review' | 'reading';
const SPLIT_KEY = 'jk-review-split';
const SPLIT_MIN = 30, SPLIT_MAX = 70;
const DIVIDER_PX = 14;
const BOTTOM_PAD_PX = 16;
// THE PANES NEVER CHANGE SIZE (owner 2026-09-21, two screenshots of this page: "the pdf viewers should never
// change size and should remain the larger size"): the fill height is computed from CONSTANTS plus the panes'
// top edge, never from what the header or the record line happen to hold — the header row is a fixed h-10
// whose page strip scrolls sideways instead of wrapping, and the record line under the panes gets a fixed
// two-line budget (a long title may run it a line long; the page then scrolls a little, the panes do not shrink).
const BELOW_PX = 48;

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
  /** the rendered text — only when there is no PDF pane (it is the fallback, never shipped beside a PDF) */
  children?: React.ReactNode;
  /** the manifest is still on its way (ReviewLoader) */
  loading?: boolean;
  loadError?: string | null;
  /** source count for the intro card (the stub manifest has none) */
  sourceCount?: number;
  /** the archive leaves serving an EDITION: a held page whose chip links to one opens the transcription here */
  editions?: EditionMap;
}

/** one cited WORK from the lane's register (contract 2026-09-16), under the source title: the full citation;
    where the whole work can be read (kind as a small label; a site-relative path is this site's own archive);
    how the holder asks to be cited; the rights statement and licence; the holder when it differs from the source's */
function WorkRecord({ w, sourceHolderUrl, compact = false }: { w: ReviewWork; sourceHolderUrl?: string; compact?: boolean }) {
  const kind = w.full_work_url_kind ? (WORK_URL_KIND[w.full_work_url_kind] ?? w.full_work_url_kind) : w.full_work_url?.startsWith('/') ? WORK_URL_KIND['site-archive'] : '';
  const ext = (href: string) => (href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {});
  const link = 'underline text-accent-ink break-words';
  const holderDiffers = w.holder && (w.holder_url ? w.holder_url !== sourceHolderUrl : true);
  return (
    <div className={cn('space-y-0.5', compact ? 'text-inherit text-ink/85' : 'text-sm text-ink/85')}>
      {w.full_citation && <p className={compact ? '' : 'leading-snug'}><Md inline>{w.full_citation}</Md></p>}
      {(w.full_work_url || w.volume_url) && (
        <p>
          <span className="text-muted">Full text: </span>
          {w.full_work_url && <a href={w.full_work_url} {...ext(w.full_work_url)} className={link}>{kind || 'the whole work'}</a>}
          {w.volume_url && w.volume_url !== w.full_work_url && <> · <a href={w.volume_url} {...ext(w.volume_url)} className={link}>this volume</a></>}
        </p>
      )}
      {w.preferred_citation && (
        <p><span className="text-muted">Cite as: </span>{w.preferred_citation}{w.preferred_citation_source && <span className="text-muted"> ({w.preferred_citation_source})</span>}</p>
      )}
      {(w.rights_statement || w.licence) && (
        <p className="text-muted">
          {w.rights_statement}{w.rights_statement && w.licence && w.licence !== w.rights ? ' · ' : ''}{w.licence && w.licence !== w.rights ? `Licence: ${w.licence}` : ''}
          {w.rights_source_url && <> · <a href={w.rights_source_url} {...ext(w.rights_source_url)} className={link}>rights source</a></>}
        </p>
      )}
      {holderDiffers && (
        <p><span className="text-muted">Held by: </span>{w.holder_url ? <a href={w.holder_url} {...ext(w.holder_url)} className={link}>{w.holder}</a> : w.holder}</p>
      )}
    </div>
  );
}

export function ReviewBody({ work, manifest, published, textHref, backHref, backLabel, children, loading = false, loadError = null, sourceCount, editions }: Props) {
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
  const pageWork: ReviewWork | undefined = page?.work ? manifest.works?.[page.work] : undefined;
  // the page's own source when a unit spans two sources; else the unit's
  const sourceKey = page?.source ?? active?.source ?? null;
  const source = sourceKey ? manifest.sources[sourceKey] : undefined;
  const rights = page?.rights || active?.rights || '';

  // layout (LeafBody's pattern): side by side by default on large screens
  // READING MODE (owner 2026-09-15): the badge is a switch — pressed, the source pane goes and the
  // book has the row to itself; a click on a citation brings review mode back with that page open
  const [mode, setMode] = useState<Mode>('review');
  const [layout, setLayout] = useState<Layout>('side');
  const [split, setSplit] = useState(50);
  const [isLg, setIsLg] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fillHeight, setFillHeight] = useState<number | null>(null);
  // the work record under the panes is a DROPDOWN (owner 2026-09-16: "the pdf view panes shouldn't be
  // affected by the data fields — present them in drop downs; the pdf panes MUST REMAIN the same size"):
  // closed by default, and rendered OUTSIDE the measured record block, so opening it never enters the
  // panes' height budget (the block under the panes is the two lines it was at a611fc1)
  const [workOpen, setWorkOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
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
        if (localStorage.getItem(MODE_KEY) === 'reading') setMode('reading');
      } catch { /* storage unavailable */ }
      onMq();
      // deep link: select the unit and bring its link into view in the book — in review mode
      const c = citeFromHash(window.location.hash);
      if (c && byId.has(c.id)) {
        const id = c.id;
        setMode('review');
        setActiveId(id);
        setPageIdx(Math.min(c.page, Math.max(0, (byId.get(id)?.pages.length ?? 1) - 1)));
        if (pdf) setTimeout(() => focusUnit(byId.get(id)), 400); // after the PDF's pages exist
        else setTimeout(() => bookRef.current?.querySelector<HTMLElement>(`a[data-cite="${id}"]`)?.scrollIntoView({ block: 'center' }), 50);
      }
    }, 0);
    mq.addEventListener('change', onMq);
    const onHash = () => { const c = citeFromHash(window.location.hash); if (c && byId.has(c.id)) { setMode('review'); setActiveId(c.id); setPageIdx(Math.min(c.page, Math.max(0, (byId.get(c.id)?.pages.length ?? 1) - 1))); } };
    window.addEventListener('hashchange', onHash);
    return () => { clearTimeout(t); mq.removeEventListener('change', onMq); window.removeEventListener('hashchange', onHash); };
  }, [byId, pdf, focusUnit]);

  const changeLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ } };
  const changeMode = (m: Mode) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };
  const reading = mode === 'reading';
  const review = !reading && layout === 'side' && isLg;
  // the book fills the viewport in side-by-side review and in reading mode
  const fills = review || (reading && isLg);

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    // constants only (BELOW_PX, never belowRef's live height): a picked citation must not move the panes' edges
    setFillHeight(Math.max(480, window.innerHeight - el.getBoundingClientRect().top - BELOW_PX - BOTTOM_PAD_PX));
  }, []);
  useEffect(() => {
    if (!fills) return;
    const t = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [fills, measure]);
  // the header row is a fixed h-10 in side-by-side (its strip scrolls, never wraps), so this observer
  // is a guard only: should the header ever change height, the panes' top edge moves and the fill follows
  useEffect(() => {
    if (!review || !headRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(headRef.current);
    return () => ro.disconnect();
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
    if (reading) changeMode('review'); // a citation asked for is a review
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
  // the cited works of the active unit (register contract 2026-09-16): the active page's work first, then the
  // unit's other pages' works in order, then the unit's own (a unit with no page still cites a work)
  const activeWorks: ReviewWork[] = (() => {
    if (!active || !manifest.works) return [];
    const ids: string[] = [];
    const push = (id?: string) => { if (id && manifest.works?.[id] && !ids.includes(id)) ids.push(id); };
    push(page?.work); (active.works ?? []).forEach(push); active.pages.forEach((p) => push(p.work)); push(active.work);
    return ids.map((id) => manifest.works![id]);
  })();
  const pageTitle = page ? `${sourceTitle}, ${page.label}` : sourceTitle;
  // the reading copy (owner rule 2026-09-15): the pane opens the work's context document scrolled
  // to the cited page; the single-page extract stays the audit copy behind "open the page PDF"
  const ctx = page?.context ?? null;
  const paneSrc = ctx ? v(ctx.file, ctx.served ?? ctx.sha256) : page?.file ? v(page.file, page.sha256) : null;
  // THE EDITION (owner 2026-09-21): a held page whose chip links to one of this site's leaves that serves a
  // professional transcription opens THAT transcription here, at the leaf's page (or the exact page the chip's
  // url names with #page=N) — never the held card. The folio image is a toggle; the leaf page (image beside
  // transcription) opens side by side in a new tab. Ported from lawsofexistence.com (loe 7a85583, 956aa93).
  const editionFor = (url: string | null | undefined) => { const r = leafFromUrl(url); return r && editions?.[r.key] ? { ...editions[r.key], page: r.page ?? editions[r.key].page } : null; };
  const edition = page && !page.file && !ctx ? editionFor(page.url) : null;
  const edKey = edition ? `${edition.pdf}#${edition.page}` : null;
  // the folio toggle is keyed to the edition page in hand, so a new citation opens on the transcription again
  const [folioKey, setFolioKey] = useState<string | null>(null);
  const showFolio = !!edKey && folioKey === edKey;
  const [edFocus, setEdFocus] = useState<PdfFocus | null>(null);
  const edPdf = edition?.pdf ?? null, edPage = edition?.page ?? null;
  useEffect(() => {
    if (!edPdf || !edPage) return;
    const t = setTimeout(() => setEdFocus({ page: edPage, y: 0, nonce: Date.now() }), 250);
    return () => clearTimeout(t);
  }, [edPdf, edPage]);
  // (no memo: a unit cites at most a few hundred pages)
  const citedInCtx: number[] = active && ctx ? active.pages.filter((p) => p.context?.file === ctx.file).map((p) => p.context!.page) : [];
  const ctxFile = ctx?.file ?? null, ctxPage = ctx?.page ?? null;
  const [ctxFocus, setCtxFocus] = useState<PdfFocus | null>(null);
  // a page change that came from the reader's own scrolling must not scroll the viewer back
  const fromScroll = useRef(false);
  useEffect(() => {
    if (!ctxFile || !ctxPage) return;
    if (fromScroll.current) { fromScroll.current = false; return; }
    // scroll the reading copy to the cited page whenever the page in hand changes (the file may be the same)
    const t = setTimeout(() => setCtxFocus({ page: ctxPage, y: 0, nonce: Date.now() }), 250);
    return () => clearTimeout(t);
  }, [ctxFile, ctxPage]);
  // owner 2026-09-15: consecutive cited pages in one reading copy are read by scrolling; the chip
  // highlight follows the page in view (and the hash with it) instead of waiting for a click
  // (a plain function: the compiler's memo rule refuses a manual memo over `active`)
  const onPageInView = (pdfPage: number) => {
    if (!active || !ctxFile) return;
    const i = active.pages.findIndex((p) => p.context?.file === ctxFile && p.context.page === pdfPage);
    if (i < 0 || i === pageIdx) return;
    fromScroll.current = true;
    setPageIdx(i);
    try { history.replaceState(null, '', hashForCite(active.id, i)); } catch { /* ignore */ }
  };

  // toolbar-left of the source pane: previous · citation i/N · next · to the note · page stepper
  const controls = (
    <div className="flex items-center gap-1 min-w-0 whitespace-nowrap">
      <button type="button" className={ctl} onClick={() => step(-1)} disabled={idx <= 0} title="Previous citation" aria-label="Previous citation"><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-xs text-muted tabular-nums px-0.5" style={{ fontWeight: 500 }}>
        {loading ? 'loading citations…' : idx >= 0 ? `${idx + 1} / ${units.length}` : `${units.length} citations`}
        {active && active.pages.length > 1 && <> · page {pageIdx + 1}/{active.pages.length}</>}
      </span>
      <button type="button" className={ctl} onClick={() => step(1)} disabled={idx < 0 || (idx >= units.length - 1 && pageIdx >= (active?.pages.length ?? 1) - 1)} title={active && pageIdx < active.pages.length - 1 ? 'Next cited page' : 'Next citation'} aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
      {active && (
        <button type="button" className={cn(ctl, 'ml-1')} onClick={toNote} title={`Show note ${active.note} in the book`}><CornerLeftUp className="h-3.5 w-3.5" /> n. {active.note}</button>
      )}
      {edition && edKey && (
        <>
          <button type="button" className={cn(ctl, 'ml-1', showFolio && 'bg-accent/20')} onClick={() => setFolioKey(showFolio ? null : edKey)} aria-pressed={showFolio}
            title={showFolio ? 'Back to the transcription' : `See the folio image — ${edition.leafLabel.toLowerCase()} ${edition.leafId}`}>
            {showFolio ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {showFolio ? 'Transcription' : 'Folio image'}
          </button>
          <a href={`${edition.leafUrl}#page=${edition.page}`} target="_blank" rel="noopener noreferrer" className={cn(ctl, 'no-underline')}
            title={`Open ${edition.leafLabel.toLowerCase()} ${edition.leafId} in a new tab — the folio image beside the transcription`}>
            <Columns className="h-3.5 w-3.5" /> Side by side <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </div>
  );

  // the page strip: every page the unit cites, grouped by source when it draws on two,
  // the active page marked, a held page shown as a marked label rather than dropped
  // (no memo: a unit cites at most a couple of dozen pages)
  const groups: { source: string | null; title: string; items: { i: number; label: string; file: string | null; url?: string }[] }[] = [];
  active?.pages.forEach((p, i) => {
    const src = p.source ?? active.source;
    let g = groups[groups.length - 1];
    if (!g || g.source !== src) { g = { source: src, title: (src && manifest.sources[src]?.title) || src || '', items: [] }; groups.push(g); }
    g.items.push({ i, label: p.label, file: p.file, url: p.url });
  });
  // a whole case can run to 160 pages (owner rule: a case cited by its first page is served whole):
  // past CHIP_MAX the strip becomes a scrubber — first page · slider · last page · the page in hand
  const CHIP_MAX = 14;
  // in side-by-side the strip is ONE fixed-height line that scrolls sideways (the panes never move for it)
  const stripShell = cn('shrink-0 rounded-lg border border-rule bg-card shadow-card px-3 flex items-center gap-x-3',
    review ? 'h-10 flex-nowrap overflow-x-auto whitespace-nowrap' : 'py-2 flex-wrap gap-y-1.5');
  const hasEdition = (url?: string) => !!editionFor(url);
  const pageStrip = active && active.pages.length > CHIP_MAX ? (
    <div className={stripShell}>
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted" style={{ fontWeight: 600 }}>{active.pages.length} pages · {active.pages.some((p) => p.begins) ? 'the whole case' : 'the cited range'}</span>
      <span className="text-xs tabular-nums text-ink/85">{active.pages[0].label}</span>
      <input type="range" min={0} max={active.pages.length - 1} value={pageIdx} onChange={(e) => goPage(Number(e.target.value))}
        aria-label="Page within the case" className="flex-1 min-w-[8rem] max-w-[24rem] accent-[#b08d57]" />
      <span className="text-xs tabular-nums text-ink/85">{active.pages[active.pages.length - 1].label}</span>
      <span className="text-xs tabular-nums rounded-md bg-ink text-on-ink px-2 h-7 inline-flex items-center gap-1" style={{ fontWeight: 600 }}>
        {!page?.file && <Lock className="h-3 w-3" aria-hidden />}{page?.label}
      </span>
      <span className="text-xs text-muted">page {pageIdx + 1} of {active.pages.length}{groups.length > 1 ? ` · ${groups.find((g) => g.items.some((it) => it.i === pageIdx))?.title ?? ''}` : ''}</span>
    </div>
  ) : active && active.pages.length > 1 ? (
    <div className={stripShell} role="tablist" aria-label="Pages cited by this citation">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted" style={{ fontWeight: 600 }}>{active.pages.length} pages cited</span>
      {groups.map((g, gi) => (
        <span key={`${g.source}-${gi}`} className={cn('inline-flex items-center gap-1', review ? 'flex-nowrap' : 'flex-wrap')}>
          {groups.length > 1 && <span className="text-xs text-muted mr-0.5 truncate max-w-[16rem]" title={g.title}>{g.title}</span>}
          {g.items.map((it) => {
            const ed = !it.file && hasEdition(it.url);
            const chipClass = cn('h-7 px-2 rounded-md text-xs tabular-nums transition-colors inline-flex items-center gap-1 no-underline',
              pageIdx === it.i ? 'bg-ink text-on-ink' : it.file || ed ? 'border border-rule text-ink/85 hover:bg-well' : 'border border-dashed border-rule text-muted hover:bg-well');
            const chipStyle = { fontWeight: pageIdx === it.i ? 600 : 500 };
            // a held page with a `url` (lane contract 2026-09-16) is a LINK: an HLS folio opens its own leaf page
            // on this site (owner's program 2026-09-15); an EXTERNAL record opens the holder's catalogue entry in
            // a new tab. A held leaf whose EDITION this site serves (a STAC membrane) is a BUTTON: the chip opens
            // the transcription HERE, at its page (owner 2026-09-21)
            if (!it.file && it.url && !ed) {
              return it.url.startsWith('http') ? (
                <a key={it.i} href={it.url} target="_blank" rel="noopener noreferrer" title={`${it.label} — the holder’s catalogue record`} className={chipClass} style={chipStyle}>
                  <ExternalLink className="h-3 w-3" aria-hidden />{it.label}
                </a>
              ) : (
                <Link key={it.i} href={it.url} title={`${it.label} — open the leaf on this site, image beside transcript`} className={chipClass} style={chipStyle}>
                  <ScrollText className="h-3 w-3" aria-hidden />{it.label}
                </Link>
              );
            }
            return (
              <button key={it.i} type="button" role="tab" aria-selected={pageIdx === it.i} onClick={() => goPage(it.i)}
                title={it.file ? `Open ${it.label}` : ed ? `Open ${it.label} — the transcription at its page` : `${it.label} — held in the library, not published`}
                className={chipClass} style={chipStyle}>
                {!it.file && !ed && <Lock className="h-3 w-3" aria-hidden />}{it.label}
              </button>
            );
          })}
        </span>
      ))}
    </div>
  ) : null;

  const paneShell = 'bg-card border border-rule rounded-lg shadow-card flex flex-col min-h-0';
  const barTitle = 'font-serif text-[15px] leading-none';

  const sourcePane = (
    <div ref={sourceRef} className={cn('min-w-0 flex flex-col', review ? 'h-full min-h-0' : 'lg:sticky lg:top-3 z-10')}>
      {!review && pageStrip && <div className="mb-2">{pageStrip}</div>}
      {edition && page ? (
        showFolio ? (
          // the folio image in the same card: the review controls take the header's title slot, the zoom controls
          // stay on the right, the holder's credit in the sub-bar — the matched-card pattern of the leaf pages
          <LeafImageViewer src={edition.image} alt={`${pageTitle} — the folio image`} heightClass={review ? 'flex-1 min-h-0' : 'h-[70vh]'} fitMode="width"
            title={controls} subtitle={<>{edition.leafLabel} {edition.leafId} · {edition.imageCredit ?? pageTitle}</>} />
        ) : (
          <PdfViewer key={edition.pdf} src={v(edition.pdf, edition.sha256)} title={`${edition.title} — ${edition.credit}; ${edition.leafLabel.toLowerCase()} ${edition.leafId} begins at page ${edition.page}`}
            downloadSrc={v(edition.pdf, edition.sha256)} downloadName={edition.pdf.split('/').pop()}
            height={review ? 'fill' : 'page'} chrome="pane" leading={controls} focus={edFocus} markedPages={[edition.page]} currentPage={edition.page} />
        )
      ) : paneSrc && page ? (
        <PdfViewer key={paneSrc} src={paneSrc} bytes={ctx?.bytes} title={ctx ? `${pageTitle} — reading copy, ${citedInCtx.length > 1 ? `${citedInCtx.length} cited pages marked` : 'the cited page marked'}` : pageTitle}
          downloadSrc={page.file ? v(page.file, page.sha256) : undefined} downloadName={(page.file ?? ctx?.file ?? '').split('/').pop()}
          height={review ? 'fill' : 'page'} chrome="pane" leading={controls}
          focus={ctx ? ctxFocus : null} markedPages={citedInCtx} currentPage={ctx?.page ?? null} onPageInView={ctx ? onPageInView : undefined} />
      ) : (
        <div className={cn(paneShell, review ? 'h-full' : 'min-h-[24rem]')}>
          <div className="h-11 px-3 flex items-center justify-between gap-3 border-b border-rule">{controls}</div>
          <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">{active ? pageTitle : 'No citation selected'}</div>
          <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 text-sm leading-relaxed">
            {!active ? (
              <>
                <p className="font-serif text-xl text-ink" style={{ fontWeight: 620 }}>Check the work at the page.</p>
                <p className="mt-3 text-ink/85">Every citation in the notes is a link. Click one and the page it cites opens here, cut from the held copy of the source, so the quotation and the pin can be read against the original without leaving this screen.</p>
                <p className="mt-3 text-ink/85">{published.toLocaleString('en-US')} citations open a published page, from {(sourceCount ?? Object.keys(manifest.sources).length).toLocaleString('en-US')} sources. Pages still in copyright, or reproduced under a licence, are held in the library and marked here rather than shown.</p>
                {loading && <p className="mt-3 text-xs text-muted inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading the citation index…</p>}
                {loadError && <p className="mt-3 text-sm text-red-700 dark:text-red-400" role="alert">The citation index could not be loaded ({loadError}). Reload the page to try again.</p>}
                <p className="mt-5"><button type="button" disabled={loading || units.length === 0} onClick={() => units[0] && select(units[0].id, true)} className="inline-flex items-center gap-1.5 rounded-md bg-ink text-on-ink px-3 py-1.5 text-sm no-underline hover:bg-ink/90" style={{ fontWeight: 600 }}>Start at the first citation <ArrowRight className="h-4 w-4" /></button></p>
              </>
            ) : (
              <>
                <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-muted" style={{ fontWeight: 600 }}>
                  {active.status === 'EXTERNAL' ? <><ExternalLink className="h-3.5 w-3.5" /> Cited by catalogue record — not held in the library</> : <><Lock className="h-3.5 w-3.5" /> Held in the library, not published</>}
                </p>
                <p className="font-serif text-lg text-ink mt-3 leading-snug" style={{ fontWeight: 620 }}>{sourceTitle}</p>
                {page ? <p className="mt-1 text-ink/85">{page.label}</p> : active.pages.length > 0 && <p className="mt-1 text-ink/85">{active.pages.map((p) => p.label).join(' · ')}</p>}
                <p className="mt-4 text-ink/85">
                  {rights && RIGHTS_LABEL[rights] && active.status !== 'EXTERNAL' ? <>{RIGHTS_LABEL[rights]}. </> : null}
                  {active.status === 'NO_SOURCE' && 'The cited edition is not held in the library; nothing is shown that was not read.'}
                  {active.status === 'NO_PIN' && 'The note cites the work without a page, so no page is opened.'}
                  {active.status === 'UNMAPPED' && 'The cited page could not be located in the held scan.'}
                  {(active.status === 'CUT' || active.status === 'CUT_FIRST') && 'The page is held and was read for this book; its reproduction is not the author’s to publish.'}
                  {active.status === 'EXTERNAL' && 'The book cites this item by the holder’s catalogue record, quoted as the record describes it; no copy is held in the library.'}
                </p>
                {page?.url && (
                  <p className="mt-3">
                    {page.url.startsWith('http') ? (
                      <a href={page.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-ink text-on-ink px-3 py-1.5 text-sm no-underline hover:bg-ink-2">
                        Open the record at the holder <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <Link href={page.url} className="inline-flex items-center gap-1.5 rounded-md bg-ink text-on-ink px-3 py-1.5 text-sm no-underline hover:bg-ink-2">
                        <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden /> Open the leaf on this site — image beside transcript
                      </Link>
                    )}
                  </p>
                )}
                {source?.holderUrl && (
                  <p className="mt-3"><a href={source.holderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-accent-ink break-all">{active.status === 'EXTERNAL' ? 'The collection’s record at the holder' : 'The holder’s copy'} <ExternalLink className="h-3.5 w-3.5 shrink-0" /></a></p>
                )}
                {activeWorks.length > 0 && (
                  <details className="mt-5 pt-4 border-t border-rule group">
                    <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-muted hover:text-ink [&::-webkit-details-marker]:hidden" style={{ fontWeight: 600 }}>
                      {activeWorks.length > 1 ? 'The works cited' : 'The work cited'} <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="mt-2 space-y-3 border-l-2 border-accent/40 pl-3 text-xs">
                      {activeWorks.map((w, i) => <WorkRecord key={i} w={w} sourceHolderUrl={source?.holderUrl} compact />)}
                    </div>
                  </details>
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
    <div className={cn('min-w-0', fills && 'h-full min-h-0 flex flex-col')}>
      <PdfViewer src={v(pdf.file, pdf.served ?? pdf.sha256)} bytes={pdf.bytes} downloadSrc={pdf.linked ? v(pdf.linked.file, pdf.linked.served ?? pdf.linked.sha256) : undefined} downloadName={`${work.slug}.pdf`} title={`${work.title}${work.subtitle ? `: ${work.subtitle}` : ''} — ${work.venue ?? 'working draft'}; ${reading ? 'a click on a citation opens review mode at its page' : 'the citations in the notes are clickable'}`}
        height={fills ? 'fill' : 'page'} chrome="pane" leading={textLink} hotBoxes={hotBoxes} activeHot={activeId} onHot={onHot} focus={focus} />
    </div>
  ) : (
    <div className={cn('min-w-0', fills && 'h-full min-h-0 flex flex-col')}>
      <div className={cn(paneShell, fills && 'h-full')}>
        <div className="h-11 px-4 flex items-center justify-between gap-3 border-b border-rule">
          <span className={cn(barTitle, 'truncate')} style={{ fontWeight: 620 }}>{work.title}{work.subtitle ? <span className="text-muted font-sans text-xs ml-2" style={{ fontWeight: 500 }}>{work.subtitle}</span> : null}</span>
          <span className="text-xs text-muted shrink-0">{work.venue ?? 'Working draft'}</span>
        </div>
        <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">Citations in the notes are links — click one to open the cited page beside the text.</div>
        <div ref={bookRef} onClick={onBookClick} className={cn('min-h-0', fills ? 'flex-1 overflow-y-auto' : '')}>
          {children ?? <p className="p-6 text-sm text-muted">The book’s text is at <Link href={textTo} className="underline text-accent-ink">the text version</Link>.</p>}
        </div>
        <div className="h-8 border-t border-rule" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className={cn('flex-grow w-full', review ? 'max-w-none px-4 py-4' : 'mx-auto max-w-site px-5 sm:px-8 py-6')}>
        {/* header row (owner 2026-09-15): back link · review-mode badge · layout toggle sit together over
            the LEFT pane; in side-by-side the page strip takes the right half, over the source pane, on the
            same column grid as the panes so the divider lines up and follows the drag */}
        <div ref={headRef}
          className={cn('mb-3', review ? 'grid items-center h-10' : 'flex flex-wrap items-center gap-3')}
          style={review ? { gridTemplateColumns: `${split}% ${DIVIDER_PX}px minmax(0, 1fr)` } : undefined}>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Link href={backHref ?? textTo} className="inline-flex items-center text-sm text-muted hover:text-ink no-underline mr-1"><ArrowLeft className="h-4 w-4 mr-1.5" />{backLabel ?? `${work.title} — the reader`}</Link>
            <button type="button" onClick={() => changeMode(reading ? 'review' : 'reading')} aria-pressed={!reading}
              title={reading ? 'Reading mode — press for review mode: the book beside the pages it cites' : 'Review mode — press for reading mode: the book alone, without the source pane'}
              className={cn('inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.06em] rounded-md px-2 py-0.5 border transition-colors',
                reading ? 'text-ink/80 border-rule bg-card hover:bg-well' : 'text-accent-ink border-accent/40 bg-accent/15 hover:bg-accent/25')}
              style={{ fontWeight: 600 }}>
              {reading ? <BookOpen className="h-3.5 w-3.5" aria-hidden /> : <Columns className="h-3.5 w-3.5" aria-hidden />}
              {reading ? 'Reading mode' : 'Review mode'}
            </button>
            {!reading && <span className="hidden lg:inline-flex items-center gap-0.5 bg-card border border-rule rounded-md shadow-card p-0.5">
              <button type="button" className={tog(layout === 'side')} onClick={() => changeLayout('side')} aria-pressed={layout === 'side'} title="Side by side — book beside the cited page" aria-label="Side-by-side layout"><Columns className="h-4 w-4" /></button>
              <button type="button" className={tog(layout === 'stacked')} onClick={() => changeLayout('stacked')} aria-pressed={layout === 'stacked'} title="Stacked — cited page above, book below" aria-label="Stacked layout"><Rows className="h-4 w-4" /></button>
            </span>}
          </div>
          {review && <div aria-hidden />}
          {review && <div className="min-w-0 h-10">{pageStrip}</div>}
        </div>

        <div ref={rowRef}
          className={cn('grid grid-cols-1 gap-4', reading ? 'max-w-5xl mx-auto' : layout === 'side' ? 'lg:grid-cols-2 lg:items-stretch' : 'items-start max-w-5xl mx-auto', review && 'lg:gap-0')}
          style={review && fillHeight ? { height: fillHeight, gridTemplateColumns: `${split}% ${DIVIDER_PX}px minmax(0, 1fr)` } : fills && fillHeight ? { height: fillHeight } : undefined}>
          {reading ? bookPane : review ? bookPane : sourcePane}
          {review && (
            <div role="separator" aria-orientation="vertical" aria-label="Resize the book/source split" title="Drag to resize · double-click to recenter"
              onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onDoubleClick={resetSplit}
              className={cn('h-full cursor-col-resize touch-none select-none flex items-center justify-center group', dragging && 'bg-accent/10')}>
              <div className={cn('w-1 h-16 rounded-full bg-rule group-hover:bg-accent transition-colors', dragging && 'bg-accent')} />
            </div>
          )}
          {!reading && (review ? sourcePane : bookPane)}
        </div>

        {/* below the panes — the cited page's record (left) · the book's record (right) */}
        <div ref={belowRef} className={cn('mt-3 min-h-9 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[11px] text-muted leading-relaxed', (reading || layout !== 'side') && 'max-w-5xl mx-auto')}>
          <div className="min-w-0 space-y-0.5">
            {reading ? (
              <p>Reading mode — the book alone. A click on a citation in the notes opens review mode at the page it cites.</p>
            ) : page ? (
              <>
                <p>
                  <span className="text-ink/80" style={{ fontWeight: 550 }}>{pageTitle}</span>
                  {' · '}{page.rights === 'external-link' ? 'the holder’s catalogue record, cited by its preferred citation; no page is held' : page.verified === true ? 'page number read on the page' : page.verified === false ? 'page placed by the scan’s offset — the number was not read on it' : 'a verso with no number to read'}
                  {active?.status === 'CUT_FIRST' && (page?.begins ? ' · the note cites the case without a page: the whole case is served, from its first page' : ' · a page of the case, cited whole')}
                  {page.file && <> · <a href={v(page.file, page.sha256)} target="_blank" rel="noopener noreferrer" className="underline text-accent-ink">open the page PDF</a></>}
                  {page.url && !edition && (page.url.startsWith('http')
                    ? <> · <a href={page.url} target="_blank" rel="noopener noreferrer" className="underline text-accent-ink break-all">the holder’s record</a></>
                    : <> · <Link href={page.url} className="underline text-accent-ink">the leaf on this site</Link></>)}
                  {ctx && <> · shown in its reading copy at page {ctx.page}{page.file ? '; the download is the single page' : ''}</>}
                  {edition && <> · shown in the transcription ({edition.credit}) at page {edition.page} · <Link href={`${edition.leafUrl}#page=${edition.page}`} className="underline text-accent-ink">the leaf page</Link>: the folio image beside it</>}
                  {/* under an edition pane the lane's rights label (the RECORD's held status) does not describe his published text */}
                  {edition ? <> · the images by permission of the holder; the transcription published in full with its author’s agreement</> : rights && RIGHTS_LABEL[rights] && <> · {RIGHTS_LABEL[rights]}</>}
                  {pageWork && (
                    <> · <button type="button" onClick={() => setWorkOpen((o) => !o)} aria-expanded={workOpen} aria-controls="review-work-record" className="inline-flex items-center gap-0.5 underline text-accent-ink hover:text-ink align-baseline">
                      the work cited <ChevronDown className={cn('h-3 w-3 transition-transform', workOpen && 'rotate-180')} aria-hidden />
                    </button></>
                  )}
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
        {/* the dropdown's body — a sibling of the measured block, never part of the panes' height budget */}
        {!reading && page && pageWork && workOpen && (
          <div id="review-work-record" className={cn('mt-2 max-w-3xl border-l-2 border-accent/40 pl-3 text-[11px] leading-relaxed', (layout !== 'side') && 'max-w-5xl mx-auto')}>
            <WorkRecord w={pageWork} sourceHolderUrl={source?.holderUrl} compact />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
