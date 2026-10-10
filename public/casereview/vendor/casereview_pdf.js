// casereview_pdf.js — the CASE REVIEW window's PDF pane: one module for BOTH
// panes (the document under review on the left, the reference at its
// primary source on the right). A vanilla-JS port of the website's review
// viewer (loe_website app/books/_components/BookPdfViewer.tsx, website-
// developer f28bb754) onto the Studio's vendored pdf.js — the behaviours the
// owner uses: pages rendered at exactly the pane width, lazily; HOT BOXES over
// a citation's text as percent-of-page buttons (so they ride every zoom);
// `focus(page, y)` scrolls to a point on a page; MARKED pages carry a margin
// badge; the page under the reading line is reported as the reader scrolls;
// one render per page, a new open cancels the old document's renders.
//
// What it never does: cut pages, copy a file, or read anything but the URL
// it is given (the API serves the PDF in place with HTTP Range, so pdf.js
// fetches the chunks the visible pages need — a 160-page filing is not read
// whole up front).
//
// Text-layer discipline (memory, WebKit): streamTextContent().getReader()
// loops, never getTextContent() / for-await; the items are cached per page
// once read (with their geometry) so a locate is one read per page ever.
import { chromeItems, foldMap, locateInItems, locatePassage, mergeLineRects, pageLines, pageOccurrences, passageOrder, passageWordsPresent, rawRange } from './casereview_core.js';

// THE HOST'S pdf.js (f28bb754's site port, 2026-10-01): the pane is vendored
// VERBATIM by the websites, so the three Studio paths are DEFAULTS a host
// may name once, before the first pane opens — the loader, the worker and
// the standard fonts of the SAME build (4.10.38: every reading-order rule
// in core was tuned on its pieces; a build change is a fixture re-measure,
// never a host's choice). Nothing else in the file names a host.
const PDFJS = { load: () => import('/lib/pdfjs/pdf.min.mjs'), workerSrc: '/lib/pdfjs/pdf.worker.min.mjs', standardFontDataUrl: '/lib/pdfjs/standard_fonts/' };
export function configurePdfjs(opts = {}) {
  if (_lib) throw new Error('configurePdfjs: pdf.js is already loaded — configure before the first pane opens');
  for (const k of Object.keys(PDFJS)) if (opts[k] != null) PDFJS[k] = opts[k];
  return { ...PDFJS };
}

let _lib = null;
async function pdfjs() {
  if (!_lib) {
    _lib = await PDFJS.load();
    _lib.GlobalWorkerOptions.workerSrc = PDFJS.workerSrc;
  }
  return _lib;
}

/** Read a page's text items with geometry through the streaming reader. */
async function readItems(page) {
  const items = [];
  const reader = page.streamTextContent({ includeMarkedContent: false }).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const it of (value && value.items) || []) {
      if (typeof it.str !== 'string') continue;
      items.push({ str: it.str, hasEOL: !!it.hasEOL, transform: it.transform, width: it.width, height: it.height });
    }
  }
  return items;
}

/** Percent-of-page rects (origin top-left) for a located span on a page
 *  whose unscaled viewport is vp1 (width, height in PDF points). */
export function rectsForSpan(span, items, vp1) {
  const out = [];
  for (const s of span.items) {
    const it = items[s.index];
    if (!it || !it.transform) continue;
    const [a, b, c, d, e, f] = it.transform;
    const w = it.width || Math.hypot(a, b) * (it.str.length || 1) * 0.5;
    const h = it.height || Math.hypot(c, d) || 10;
    const len = Math.max(1, s.len);
    const x0 = e + w * (s.from / len);
    const x1 = e + w * ((s.to + 1) / len);
    // pdf.js text items sit on the baseline at f; the glyph box rises ~h
    const yTop = vp1.height - (f + h);
    out.push({
      left: (x0 / vp1.width) * 100, top: (yTop / vp1.height) * 100,
      width: ((x1 - x0) / vp1.width) * 100, height: (h * 1.15 / vp1.height) * 100,
    });
  }
  return out;
}

// ---------------------------------------------------------------- measured boxes
// (foldMap and rawRange — the fold with provenance the measured boxes need —
// live in casereview_core.js beside the fold they replay.)
/** Units in the order they sit on the page: pdf page, then the located box's
 *  top, then its left; a unit without a box comes after the located ones of
 *  its page in row order (f28bb754's N3: "sort by the located box's top once
 *  boxes exist"). pageOf(u) gives the page of an unlocated unit. */
export function orderByPosition(units, pageOf) {
  const key = (u) => { const r = u.rects && u.rects[0]; return [u.pdfPage || (pageOf && pageOf(u)) || 0, u.missing ? 1 : 0, r ? r.top : 0, r ? r.left : 0, u.line || 0]; };
  return [...(units || [])].sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return 0; });
}

export function createPdfPane(host, opts = {}) {
  const pane = {
    host, doc: null, gen: 0, holders: [], scroller: null, stack: null,
    marked: new Set(), boxes: new Map(), textCache: new Map(), vp1: new Map(),
    url: null, numPages: 0, current: 1, lib: null, ro: null, io: null,
  };
  const onPage = opts.onPage || (() => {});
  const onBoxClick = opts.onBoxClick || (() => {});

  function teardown() {
    pane.gen++;
    if (pane.io) { try { pane.io.disconnect(); } catch {} pane.io = null; }
    if (pane.ro) { try { pane.ro.disconnect(); } catch {} pane.ro = null; }
    if (pane.doc) { try { pane.doc.destroy(); } catch {} pane.doc = null; }
    pane.holders = []; pane.textCache.clear(); pane.vp1.clear(); pane.boxes.clear();
    pane.marked = new Set(); pane.numPages = 0; pane.current = 1;
    host.innerHTML = '';
  }

  pane.destroy = teardown;

  /** Open a PDF by URL. Resolves with {pages} or throws. */
  pane.open = async (url) => {
    teardown();
    const gen = pane.gen;
    pane.url = url;
    const lib = pane.lib = await pdfjs();
    host.innerHTML = '<div class="cr-loading">opening…</div>';
    let doc;
    try {
      // standardFontDataUrl (N1, f28bb754): a PDF in the base-14 fonts with
      // nothing embedded (a shelf opinion, the fixture) draws boxes over
      // white without pdf.js's standard fonts — vendored at lib/pdfjs/standard_fonts/ (PDFJS.standardFontDataUrl; a host names its own)
      doc = await lib.getDocument({ url, disableAutoFetch: true, disableStream: false, rangeChunkSize: 65536,
                                    standardFontDataUrl: PDFJS.standardFontDataUrl }).promise;
    } catch (e) {
      if (pane.gen !== gen) return null;
      host.innerHTML = `<div class="cr-error">could not open the document — ${esc(String(e && e.message || e))}</div>`;
      throw e;
    }
    if (pane.gen !== gen) { try { doc.destroy(); } catch {} return null; }
    pane.doc = doc; pane.numPages = doc.numPages;
    host.innerHTML = '';
    const scroller = pane.scroller = document.createElement('div');
    scroller.className = 'cr-scroll';
    const stack = pane.stack = document.createElement('div');
    stack.className = 'cr-stack';
    scroller.appendChild(stack);
    host.appendChild(scroller);
    await layout(gen);
    if (pane.gen !== gen) return null;
    scroller.addEventListener('scroll', () => reportPage(), { passive: true });
    pane.ro = new ResizeObserver(() => { clearTimeout(pane._refit); pane._refit = setTimeout(() => refit(), 120); });
    pane.ro.observe(scroller);
    return { pages: doc.numPages };
  };

  /** The page object and its size, fetched ONCE on demand (N2, f28bb754:
   *  awaiting getPage for every page before the first placeholder was 401
   *  fetches for ECF 51-55 under range loading). Placeholders are sized
   *  from page 1 and corrected here when a page is first needed — by the
   *  observer to draw it, by a locate to box it, by a focus to reach it. */
  async function ensurePage(i) {
    const h = pane.holders[i - 1];
    if (!h) return null;
    if (h.page) return h.page;
    if (!h.pending) {
      const gen = pane.gen;
      h.pending = pane.doc.getPage(i).then((page) => {
        if (pane.gen !== gen) return null;
        const vp1 = page.getViewport({ scale: 1 });
        pane.vp1.set(i, { width: vp1.width, height: vp1.height });
        h.page = page; h.vp1w = vp1.width; h.vp1h = vp1.height;
        h.scale = pane.width / vp1.width;
        const hpx = Math.round(vp1.height * h.scale);
        if (h.holder.clientHeight !== hpx) h.holder.style.height = `${hpx}px`;
        return page;
      }).catch(() => { h.pending = null; return null; });
    }
    return h.pending;
  }
  pane.ensurePage = ensurePage;

  async function layout(gen) {
    const doc = pane.doc, stack = pane.stack, scroller = pane.scroller;
    const width = Math.max(scroller.clientWidth, 320);
    pane.width = width;
    stack.innerHTML = '';
    pane.holders = [];
    // page 1 sizes every placeholder; each page corrects itself when first needed
    const first = await doc.getPage(1);
    if (pane.gen !== gen) return;
    const vp1first = first.getViewport({ scale: 1 });
    const scale0 = width / vp1first.width;
    for (let i = 1; i <= doc.numPages; i++) {
      const holder = document.createElement('div');
      holder.className = 'cr-pdfpage' + (pane.marked.has(i) ? ' is-marked' : '');
      holder.dataset.page = String(i);
      holder.style.width = `${width}px`;
      holder.style.height = `${Math.round(vp1first.height * scale0)}px`;
      holder.innerHTML = `<span class="cr-pageno">${i}</span><div class="cr-hot" data-page="${i}"></div>`;
      stack.appendChild(holder);
      pane.holders.push({ holder, page: null, pending: null, scale: scale0, vp1w: vp1first.width, vp1h: vp1first.height, drawn: false });
      paintBoxes(i);
    }
    pane.holders[0].page = first; pane.holders[0].pending = Promise.resolve(first);
    pane.vp1.set(1, { width: vp1first.width, height: vp1first.height });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lib = pane.lib;
    const io = pane.io = new IntersectionObserver(async (entries) => {
      if (pane.gen !== gen) { io.disconnect(); return; }
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const h = pane.holders[+en.target.dataset.page - 1];
        if (!h || h.drawn) continue;
        h.drawn = true;
        const page = await ensurePage(+en.target.dataset.page);
        if (!page || pane.gen !== gen) { h.drawn = false; continue; }
        const vp = h.page.getViewport({ scale: h.scale * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = '100%';
        h.holder.insertBefore(canvas, h.holder.firstChild);
        const task = h.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        task.promise.catch(() => { h.drawn = false; });
        const tlVp = h.page.getViewport({ scale: h.scale });
        const tl = document.createElement('div');
        tl.className = 'textLayer';
        tl.style.setProperty('--scale-factor', String(tlVp.scale));
        h.holder.insertBefore(tl, h.holder.querySelector('.cr-hot'));
        // the text layer's spans are the measure for the boxes (one span per
        // text item, in stream order — pdf.js pushes every item with a str to
        // textDivs); once drawn, the page's boxes are repainted measured
        const layer = h.tl = new lib.TextLayer({ textContentSource: h.page.streamTextContent(), container: tl, viewport: tlVp });
        h.tlReady = false;
        layer.render().then(() => { if (pane.gen !== gen) return; h.tlReady = true; paintBoxes(+h.holder.dataset.page); }).catch(() => {});
      }
    }, { root: scroller, rootMargin: '900px' });
    pane.holders.forEach(h => io.observe(h.holder));
  }

  async function refit() {
    if (!pane.doc || !pane.scroller) return;
    const w = Math.max(pane.scroller.clientWidth, 320);
    if (w === pane.width) return;
    const ratio = pane.scroller.scrollTop / Math.max(1, pane.scroller.scrollHeight);
    if (pane.io) { try { pane.io.disconnect(); } catch {} }
    await layout(pane.gen);
    pane.scroller.scrollTop = ratio * pane.scroller.scrollHeight;
  }

  function reportPage() {
    const s = pane.scroller;
    if (!s || !pane.holders.length) return;
    const line = s.scrollTop + Math.min(120, s.clientHeight / 3);
    let cur = 1;
    for (const h of pane.holders) {
      if (h.holder.offsetTop <= line) cur = +h.holder.dataset.page; else break;
    }
    // at the scroller's END the reading line cannot reach a last page's top
    // (b0d76502's N1: rpage said 3 for a cited last page 4): there, the
    // current page is the last one whose top is on screen
    if (s.scrollTop + s.clientHeight >= s.scrollHeight - 2) {
      for (const h of pane.holders) if (h.holder.offsetTop < s.scrollTop + s.clientHeight) cur = +h.holder.dataset.page;
    }
    if (cur !== pane.current) { pane.current = cur; onPage(cur); }
  }

  /** Scroll so that `y` PDF points from the top of `page` sits near the top. */
  pane.focus = (page, y = 0) => {
    const h = pane.holders[page - 1];
    if (!h || !pane.scroller) return false;
    if (!h.page) ensurePage(page);            // size it; the scroll lands on the page-1 estimate first
    // the host is told the page FIRST: its chrome for the page (the cites row)
    // re-lays synchronously and changes the well's height — a scroll clamped
    // before that lands short of a last page's top (measured 2026-09-29:
    // 27 px short, the reading line then said page 2 for a jump to page 3)
    pane.current = page; onPage(page);
    const yPx = (y / h.vp1h) * h.holder.clientHeight;
    pane.scroller.scrollTo({ top: Math.max(0, h.holder.offsetTop + yPx - 24), behavior: 'auto' });
    return true;
  };

  /** Mark a set of pdf pages (the cited page and its span) in the margin. */
  pane.setMarked = (pages) => {
    pane.marked = new Set((pages || []).filter(p => Number.isFinite(p)));
    for (const h of pane.holders) h.holder.classList.toggle('is-marked', pane.marked.has(+h.holder.dataset.page));
  };

  /** Hot boxes for a page: [{id, rects:[{left,top,width,height}%], status, title}]. */
  pane.setBoxes = (page, boxes) => { pane.boxes.set(page, boxes || []); paintBoxes(page); };
  pane.clearBoxes = () => { pane.boxes.clear(); for (const h of pane.holders) paintBoxes(+h.holder.dataset.page); };

  /** A span item's rect from the TEXT LAYER's own glyphs: a DOM Range over
   *  the item's span, from the raw offsets behind the folded range (foldMap),
   *  relative to the page holder in percent. null → keep the proportional
   *  rect (no layer yet, an unattached empty span, a fold the map cannot
   *  vouch for, a collapsed range). */
  function measureItem(h, page, s) {
    const divs = h.tl && h.tl.textDivs;
    const items = pane.textCache.get(page);
    const div = divs && divs[s.index], it = items && items[s.index];
    if (!div || !it || !div.isConnected || !div.firstChild || div.firstChild.nodeType !== 3 || div.textContent !== it.str) return null;
    // the span carries the RAW range since P62 (the page is folded once with
    // provenance in core.foldItems); foldMap over the piece is the fallback
    let rr = null;
    if (Number.isFinite(s.rawFrom) && Number.isFinite(s.rawTo)) {
      const code = it.str.charCodeAt(s.rawTo);
      rr = [s.rawFrom, s.rawTo + (code >= 0xd800 && code <= 0xdbff ? 2 : 1)];
    } else {
      const fm = foldMap(it.str, { chrome: false });   // a piece is never chrome on its own (core.chromeItems judges the line)
      if (!fm.ok) return null;
      rr = rawRange(fm.map, s.from, s.to, it.str);
    }
    if (!rr || rr[1] > div.firstChild.length) return null;
    const range = document.createRange();
    range.setStart(div.firstChild, rr[0]); range.setEnd(div.firstChild, rr[1]);
    let l = Infinity, t = Infinity, r = -Infinity, btm = -Infinity;
    for (const x of range.getClientRects()) { if (!x.width) continue; l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); btm = Math.max(btm, x.bottom); }
    const host = h.holder.getBoundingClientRect();
    if (!(r > l) || !(btm > t) || !host.width || !host.height) return null;
    return { left: ((l - host.left) / host.width) * 100, top: ((t - host.top) / host.height) * 100,
             width: ((r - l) / host.width) * 100, height: ((btm - t) / host.height) * 100, measured: true };
  }
  /** The rects to paint for a box: measured per item where the text layer
   *  can vouch for it, the proportional rect otherwise. */
  function rectsToPaint(h, page, b) {
    if (!h.tlReady || !b.span || !b.span.items || !b.span.items.length) return b.rects;
    const items = pane.textCache.get(page), vp1 = pane.vp1.get(page);
    const out = [];
    for (const s of b.span.items) {
      const m = measureItem(h, page, s);
      if (m) { out.push(m); continue; }
      const p = items && vp1 ? rectsForSpan({ items: [s] }, items, vp1)[0] : null;
      if (p) out.push(p);
    }
    return out.length ? out : b.rects;
  }

  function paintBoxes(page) {
    const h = pane.holders[page - 1];
    if (!h) return;
    const hot = h.holder.querySelector('.cr-hot');
    if (!hot) return;
    // a repaint (the text layer arriving after a step) keeps the active outline
    const active = new Set([...hot.querySelectorAll('.cr-box.is-active')].map(el => el.dataset.id));
    hot.innerHTML = '';
    for (const b of pane.boxes.get(page) || []) {
      for (const r of mergeLineRects(rectsToPaint(h, page, b))) {   // one rect per line: a highlight, not a brick wall of pieces
        const btn = document.createElement('button');
        btn.className = `cr-box is-${b.status || 'mapped'}` + (b.active || active.has(b.id) ? ' is-active' : '') + (b.approx ? ' is-approx' : '') + (r.measured ? ' is-measured' : '');
        btn.type = 'button';
        btn.title = b.title || '';
        btn.dataset.id = b.id;
        btn.style.left = `${r.left}%`; btn.style.top = `${r.top}%`;
        btn.style.width = `${r.width}%`; btn.style.height = `${r.height}%`;
        btn.addEventListener('click', (ev) => { ev.preventDefault(); onBoxClick(b, ev); });
        hot.appendChild(btn);
      }
    }
  }

  /** Locate the occ-th occurrence of `quote` on a pdf page → percent rects
   *  (or null). One text read per page, cached. */
  async function locateSpan(page, quote, occ = 1) {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const items = await itemsOf(page, gen);
    if (!items) return null;
    const span = locateInItems(items, quote, occ);
    if (!span) return null;
    const vp1 = pane.vp1.get(page);
    return vp1 ? { rects: rectsForSpan(span, items, vp1), span: { items: span.items } } : null;
  }
  pane.locate = async (page, quote, occ = 1) => { const r = await locateSpan(page, quote, occ); return r ? r.rects : null; };

  async function itemsOf(page, gen) {
    let items = pane.textCache.get(page);
    if (!items) {
      const p = await ensurePage(page);
      if (!p || pane.gen !== gen) return null;
      items = await readItems(p);
      if (pane.gen !== gen) return null;
      pane.textCache.set(page, items);
    }
    return items;
  }

  /** PARTS-PER-PAGE locate (website-developer f28bb754, the site's ReviewBox
   *  shape): the occ-th occurrence of `quote` beginning on `page` → [{page,
   *  rects}] — one part, or two when the citation wraps across the page
   *  break (admin 2ee3c4f8's page-wrap ruling: the occurrence belongs to the
   *  page it BEGINS on). The single-page read is the fast path; the two-page
   *  read runs only when it misses and a next page exists, and then counts
   *  the way the checker's page_occurrences counts (core.pageOccurrences):
   *  the plain hits over the seam-folded join, plus the WRAP-SPLIT hit
   *  (P52b) whose head ends this page's citation text and whose tail begins
   *  the next page — boxed as two parts, `wrapped: true`. null = not found. */
  pane.locateParts = async (page, quote, occ = 1) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const one = await locateSpan(page, quote, occ);
    if (one && one.rects.length) return [{ page, rects: one.rects, span: one.span }];
    if (page >= pane.numPages) return null;
    const a = await itemsOf(page, gen); if (!a) return null;
    const b = await itemsOf(page + 1, gen); if (!b) return null;
    const hit = pageOccurrences(a, b, quote)[occ - 1];
    if (!hit) return null;
    const vpA = pane.vp1.get(page), vpB = pane.vp1.get(page + 1);
    const parts = [];
    if (hit.wrapped) {
      if (vpA && hit.head.items.length) parts.push({ page, rects: rectsForSpan({ items: hit.head.items }, a, vpA), span: { items: hit.head.items }, wrapped: true });
      if (vpB && hit.tail.items.length) parts.push({ page: page + 1, rects: rectsForSpan({ items: hit.tail.items }, b, vpB), span: { items: hit.tail.items }, wrapped: true });
    } else {
      for (const pg of [page, page + 1]) {
        const base = pg === page ? 0 : a.length;
        const sub = hit.items.filter(s => s.index >= base && s.index < base + (pg === page ? a.length : b.length)).map(s => ({ ...s, index: s.index - base }));
        const vp1 = pg === page ? vpA : vpB;
        if (!sub.length || !vp1) continue;
        parts.push({ page: pg, rects: rectsForSpan({ items: sub }, pg === page ? a : b, vp1), span: { items: sub } });
      }
    }
    return parts.length ? parts : null;
  };

  /** THE PASSAGE (README l.34, the owner's whole-passage standard): the
   *  row's target_quote located over target_page … target_page_end with the
   *  page after appended for the wrap only (core.locatePassage — fragments
   *  in order, the whole run boxed, retry (c) and the line-end join (d)) →
   *  [{page, rects, span, retry}] one part per page the run crosses (a
   *  middle page whole), or null. The quote's rule is the span rule alone:
   *  the wrap-split (P52b) belongs to the citation locate (locateParts). */
  pane.locatePassage = async (page, end, quote, opts = null) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const first = Math.max(1, page | 0);
    const last = Math.min(Math.max(first, end | 0 || first), pane.numPages);
    if (first > pane.numPages) return null;
    const list = [];
    for (let p = first; p <= Math.min(last + 1, pane.numPages); p++) {
      const items = await itemsOf(p, gen);
      if (!items) return null;
      list.push(items);
    }
    const hit = locatePassage(list, last - first + 1, quote, opts);
    if (!hit) return null;
    const parts = [];
    for (const part of hit.parts) {
      const pg = first + part.k;
      const vp1 = pane.vp1.get(pg);
      if (!vp1 || !part.items.length) continue;
      parts.push({ page: pg, rects: rectsForSpan({ items: part.items }, list[part.k], vp1), span: { items: part.items }, retry: hit.retry, headToTail: !!hit.headToTail });
    }
    return parts.length ? parts : null;
  };

  /** Does any page of [page, end] carry BODY text — an item with a word in
   *  it that is not a chrome line (the CM/ECF stamp is text on an otherwise
   *  image-only page: Klayman v. Obama, No. 13-cv-0851 ECF 175 p3 hands 7
   *  items, all the stamp)? The registry marks a whole FILE text_layer:
   *  false (P57); a scanned PAGE inside a text document is the viewer's own
   *  to notice, so a passage it cannot box is said as "no text layer" rather
   *  than "not found". null when the pages cannot be read. */
  pane.spanHasText = async (page, end) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const first = Math.max(1, page | 0), last = Math.min(Math.max(first, end | 0 || first), pane.numPages);
    for (let p = first; p <= last; p++) {
      const items = await itemsOf(p, gen);
      if (!items) return null;
      const chrome = chromeItems(items);
      if (items.some((it, i) => !chrome.has(i) && it.str && /[\p{L}\p{N}]/u.test(it.str))) return true;
    }
    return false;
  };

  /** The share of the quote's words the span carries at all (the pane's
   *  "scrambled" test after a miss: every word there, none in order). */
  /** The ORDER of the quote's words on the span (core.passageOrder) — the saying of a miss names what was measured (N3). */
  pane.passageOrder = async (page, end, quote) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const first = Math.max(1, page | 0), last = Math.min(Math.max(first, end | 0 || first), pane.numPages);
    const list = []; for (let p = first; p <= last; p++) { const items = await itemsOf(p, gen); if (!items) return null; list.push(items); }
    return passageOrder(list, quote);
  };
  /** Did the fold find a GUTTER (two text columns) on any page of the span? The two-column clause of a miss rides this alone. */
  pane.spanColumns = async (page, end) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const first = Math.max(1, page | 0), last = Math.min(Math.max(first, end | 0 || first), pane.numPages);
    // pageLines SPLITS a page at its gutter before returning (splitColumns), so the detector run on its lines answers none; the
    // page's gutter is the marker the split leaves on them — `gutter` (measured 2026-10-05: the former read answered false on
    // every two-column page, Ly v. Nystrom pdf 9 included)
    // the split makes NEW line objects for each half (`col` L | R) and leaves `gutter` on the lines it did not split — a page joined on every line carries col alone; read either
    for (let p = first; p <= last; p++) { const items = await itemsOf(p, gen); if (!items) return null; if (pageLines(items, chromeItems(items)).some((l) => l.col === 'L' || l.col === 'R' || Number.isFinite(l.gutter))) return true; }
    return false;
  };
  pane.passageWords = async (page, end, quote) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const first = Math.max(1, page | 0), last = Math.min(Math.max(first, end | 0 || first), pane.numPages);
    const list = [];
    for (let p = first; p <= Math.min(last + 1, pane.numPages); p++) { const items = await itemsOf(p, gen); if (!items) return null; list.push(items); }
    return passageWordsPresent(list, quote);
  };

  /** IN-PANE SEARCH (website-developer f28bb754's check 5: "the owner reads
   *  by searching phrases"): every page's text read once (cached), matched
   *  loosely (case-insensitive, no token boundary) → hits [{page, rects}]
   *  in reading order; `textless` when no page has a text layer (an
   *  image-only scan says so instead of answering "0 hits"). Progress is
   *  reported per page so a 160-page filing shows it is working. */
  pane.search = async (query, onProgress) => {
    if (!pane.doc) return null;
    const gen = pane.gen;
    const hits = [];
    let anyText = false;
    for (let p = 1; p <= pane.numPages; p++) {
      const items = await itemsOf(p, gen);
      if (!items) return null;
      if (!anyText && items.some(it => it.str && it.str.trim())) anyText = true;
      const vp1 = pane.vp1.get(p);
      for (let occ = 1; occ <= 400; occ++) {
        const span = locateInItems(items, query, occ, { loose: true });
        if (!span) break;
        if (vp1) hits.push({ page: p, rects: rectsForSpan(span, items, vp1) });
      }
      if (onProgress) onProgress(p, pane.numPages, hits.length);
    }
    return { hits, textless: !anyText };
  };

  /** Paint the search hits (a layer of their own, under the citation boxes);
   *  `current` is the index of the hit walked to. */
  pane.setHits = (hits, current = -1) => {
    pane.hits = hits || [];
    pane.hitCurrent = current;
    for (const h of pane.holders) {
      const layer = h.holder.querySelector('.cr-hits');
      if (layer) layer.innerHTML = '';
    }
    pane.hits.forEach((hit, i) => {
      const h = pane.holders[hit.page - 1];
      if (!h) return;
      let layer = h.holder.querySelector('.cr-hits');
      if (!layer) { layer = document.createElement('div'); layer.className = 'cr-hits'; h.holder.insertBefore(layer, h.holder.querySelector('.cr-hot')); }
      for (const r of mergeLineRects(hit.rects)) {
        const el = document.createElement('span');
        el.className = 'cr-hit' + (i === current ? ' is-current' : '');
        el.style.left = `${r.left}%`; el.style.top = `${r.top}%`;
        el.style.width = `${r.width}%`; el.style.height = `${r.height}%`;
        layer.appendChild(el);
      }
    });
  };
  pane.gotoHit = (i) => {
    const hit = pane.hits && pane.hits[i];
    if (!hit) return false;
    pane.setHits(pane.hits, i);
    const vp1 = pane.vp1.get(hit.page) || { height: 792 };
    pane.focus(hit.page, ((hit.rects[0] ? hit.rects[0].top : 0) / 100) * vp1.height - 40);
    return true;
  };
  pane.clearHits = () => pane.setHits([], -1);

  pane.pageCount = () => pane.numPages;
  return pane;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
