// casereview.js — the CASE REVIEW window (owner directive 2026-09-29 21:39
// UTC, eight linked seats): "a review system like we have on the websites
// for The Subject's Unanswered Plea book for my DDC case files … a dedicated
// studio window in the ourstudio side rail, making all references, citations
// … navigable through links within two pdf panes. On the left the pdf is the
// document reviewed, on the right there is the reference pane displaying
// whatever citation or reference is linked at its primary source. There
// should be a sidebar navigation at the far left of the window that displays
// all DDC filings, highlighting each document with different colors
// signifying which pane its displayed in."
//
// A PLUGIN like sites.js: mode.js mounts it lazily (data-nav="casereview",
// body[data-mode="casereview"] #casereviewRoot). Three columns: the FILINGS
// NAV (every docs.json row under its group, attachments nested, a row
// coloured by the pane showing it), the LEFT pane (the document under review
// with its citations boxed), the RIGHT pane (the reference at its primary
// source, scrolled to the stamped page with the span marked). Both panes are
// casereview_pdf.js; the lane's contract is casereview_core.js.
//
// The three behaviours the owner uses most on the sites (website-developer
// f28bb754, 2026-09-29): (1) STEP through the citations — prev/next in
// document order, each step scrolls the left pane to the box, opens the
// right at the page with the span marked, and updates the deep link so the
// place can be copied; (2) the RIGHT PANE SAYS what it shows and what it
// cannot — one line, never a silent fall-back; (3) the REVIEWED DOCUMENT
// NEVER MOVES under the reader — a citation changes the right pane only, the
// split is remembered, the panes never change size.
//
// DATA (read-only; the window never writes a case artifact):
//   docs  = GET /api/casereview/docs?root=        docs.json + per-doc link counts
//   links = GET /api/casereview/links/{id}?root=  the validated rows (TSV text or
//           {rows, problems}) — the validator's answer IS the API's answer
//   file  = GET /api/casereview/file/{id}?root=   the PDF in place, HTTP Range
// `root` is the aux window's own project root (the P49 lesson: every project
// call from a ?projroot= window carries it). A FIXTURE lane replaces the API
// for development: ?crfixture=<base url> reads <base>/docs.json,
// <base>/<id>_LINKS.tsv and <base>/<id>.pdf (tests/fixtures/casereview).
import { $, esc } from './base.js';
import { createPdfPane, orderByPosition } from './casereview_pdf.js';
import { buildHash, filterNav, foldText, gapPage, hideRows, ligatureDropFor, navRows, navView, opensWhere, parseHash, parseLinksTsv, pdfPageFor, publishedAway, saysFor, servedColumns, tabsActivate, tabsClose, tabsEmpty, tabsExploring, tabsFind, tabsLock, tabsOpen, tabsRestore, tabsSerialize, tabsSetPage, tabsShown, tabsUnlock, tabsView, targetPages, unitForCite, unitStatus, unitsOf, urlForState } from './casereview_core.js';
import { showCtx } from '../filing/ctxmenu.js';
import { openReview } from './reviews.js';

// N4 (studio-spec's ruling): the split and the nav width are per WINDOW
// identity — the shell's convention (kdeck_rail_side[:<win id>]) — because a
// project window and the primary want different splits.
const WIN_ID = (() => { const q = new URLSearchParams(location.search); return q.get('docwin') || q.get('docfocus') || q.get('wsdetach') || q.get('projroot') || ''; })();
const SPLIT_KEY = 'ourstudio_cr_split' + (WIN_ID ? `:${WIN_ID}` : '');
const NAV_KEY = 'ourstudio_cr_nav' + (WIN_ID ? `:${WIN_ID}` : '');
const NAV_COLLAPSE_AT = 120;   // px: drag the filings list narrower than this and it snaps to nothing (filing/splits.js uses 120 too)
const SPLIT_MIN = 28, SPLIT_MAX = 72;

const st = {
  mounted: false, source: null, docs: [], byId: new Map(),
  left: { id: null, pane: null, links: null, units: null, doc: null, page: 1, problems: [], coverage: [], coverageAnswered: [], here: [], showProblems: false },
  // P88 THE TAB BAR (owner 2026-10-02): the right pane is up to five TABS, each its own pane and state — st.right is the ACTIVE
  // tab's state object (id, doc, page, pane, links, units, boxesByPage, passage, stale, reviewable, says, host, tabId); the
  // bar's model is core's (tabs.bar), the states live in tabs.states by tab id. P87's right-pane boxes and passage are per tab.
  right: null,
  tabs: { bar: null, states: new Map(), stored: null, linkCache: new Map() },
  active: null,            // {unit, k}
  split: 50, navW: 260,
  // THE TREE (owner 2026-09-29 22:05 CDT): which parents are expanded, which
  // groups are open, whether the nav is folded to a rail, the filter — kept
  // per case root in localStorage as the IDE tree keeps its open directories
  nav: { open: new Set(), groups: new Set(['Filings']), rail: false, filter: '', key: '', revealed: { left: null, right: null },
         // the sidebar's HIDDEN SET (owner 2026-09-30 03:56 CDT): docket threshold + ids by hand, per case root; showHidden draws them dimmed for the session
         // P97v (studio-spec 7d866ecf's ruling 2026-10-09 on this seat's MN measure: the DDC's 47 as the constant hid every
         // MN filing, the docket there topping out at 37): the threshold's DEFAULT comes from the REGISTRY — the docs payload's
         // top-level `registry.nav.hide_before` (the admin writes 47 on the DDC registry, none on the MN) — and is "nothing
         // hidden until set" when the registry carries none; the reader's stored value wins over both
         hidden: new Set(), pins: new Set(), hideBefore: null, hideDefault: null, hideOn: true, showHidden: false,
         // HIGHLIGHTS (owner 2026-09-30 ~04:5x CDT, relayed by d735a78c: "a button that removes highlights (but everything remains clickable) and also restores them"): the boxes' PAINT, per case root; the hit areas never move
         boxes: true },
};

// ---------------------------------------------------------------- sources
function projRootQS() {
  // the HOST's root first (mountCaseReview({ root }) — a site mounting a second case names its slug, the sites' form,
  // f28bb754/55339aa7 2026-10-09), else the aux window's own project root from the page URL
  const r = st.hostRoot || new URLSearchParams(location.search).get('projroot');
  return r ? `?root=${encodeURIComponent(r)}` : '';
}
function apiSource() {
  const qs = projRootQS();
  return {
    kind: 'api',
    docs: async () => {
      const r = await fetch(`/api/casereview/docs${qs}`);
      if (r.status === 404) {
        // the server's own 404 says WHY when the route exists (studio-spec's
        // return on the owner's 18:37 window: "this project has no case tree"
        // in an ink_site project, "no case review lane" in a work_station
        // project without the lane) — print that; the "not on this server"
        // line is for a bare Not Found only, when the route is missing
        let detail = '';
        try { const j = await r.json(); detail = typeof j.detail === 'string' ? j.detail : ''; } catch {}
        if (detail) return { unavailable: `${detail} — the Case Review window reads the DDC case tree; open it in the work_station project` };
        return { unavailable: 'the case review API is not on this server yet (studio-spec 7d866ecf\'s half) — open with ?crfixture=<base> to develop against the fixture' };
      }
      if (!r.ok) throw new Error(`docs: HTTP ${r.status}`);
      return r.json();
    },
    links: async (id) => {
      const r = await fetch(`/api/casereview/links/${encodeURIComponent(id)}${qs}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`links: HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      return ct.includes('json') ? r.json() : r.text();
    },
    fileUrl: (id) => `/api/casereview/file/${encodeURIComponent(id)}${qs}`,
  };
}
function fixtureSource(base) {
  const b = base.replace(/\/+$/, '');
  return {
    kind: 'fixture', base: b,
    docs: async () => { const r = await fetch(`${b}/docs.json`); if (!r.ok) throw new Error(`fixture docs.json: HTTP ${r.status}`); return r.json(); },
    links: async (id) => {
      const r = await fetch(`${b}/${encodeURIComponent(id)}_LINKS.tsv`);
      if (!r.ok) return null;
      const tsv = await r.text();
      // the sidecar (README amendment c): a map cut against another render
      // of the source is said, never drawn on moved pages
      const problems = [];
      let meta = null;
      try {
        const m = await fetch(`${b}/${encodeURIComponent(id)}_LINKS.meta.json`);
        if (m.ok) meta = await m.json();
      } catch {}
      const doc = st.byId.get(id);
      if (meta && doc && meta.src_sha256 && doc.sha256 && meta.src_sha256 !== doc.sha256) {
        problems.push(`cut against an earlier render: the map's src_sha256 ${String(meta.src_sha256).slice(0, 12)}… is not the registry's ${String(doc.sha256).slice(0, 12)}… — boxes may sit on moved pages`);
      }
      // P53/P55 on the fixture lane: an optional <id>_LINKS.coverage.json —
      // the checker's open gap lines as a JSON list, or {coverage,
      // coverage_answered} — stands in for the API's
      let coverage = [], coverage_answered = [];
      try {
        const c = await fetch(`${b}/${encodeURIComponent(id)}_LINKS.coverage.json`);
        if (c.ok) { const j = await c.json(); if (Array.isArray(j)) coverage = j; else { coverage = j.coverage || []; coverage_answered = j.coverage_answered || []; } }
      } catch {}
      return { tsv, problems, meta, coverage, coverage_answered };
    },
    fileUrl: (id) => `${b}/${encodeURIComponent(id)}.pdf`,
  };
}
export function pickSource() {
  const fx = new URLSearchParams(location.search).get('crfixture');
  return fx ? fixtureSource(fx) : apiSource();
}

/** The links answer, whatever its shape: TSV text, or {rows, problems, tsv}. */
export function normaliseLinks(answer) {
  if (answer == null) return { rows: [], problems: [], coverage: [], coverageAnswered: [], absent: true };
  if (typeof answer === 'string') {
    const { rows, errors } = parseLinksTsv(answer);
    return { rows, problems: errors, coverage: [], coverageAnswered: [], absent: false };
  }
  if (typeof answer.tsv === 'string') {
    const { rows, errors } = parseLinksTsv(answer.tsv);
    return { rows, problems: [...errors, ...(answer.problems || [])], coverage: (answer.coverage || []).map(String), coverageAnswered: (answer.coverage_answered || []).map(String), absent: false };
  }
  // studio-spec's API (7d866ecf): {doc_id, file, header, rows[...], errors,
  // warnings, meta, stale_render, counts, ok} — every row served, a bad one
  // MARKED by its violations; the checker's answer is the API's answer.
  const rows = Array.isArray(answer.rows) ? answer.rows.map(rowFromJson) : [];
  const problems = [...(answer.problems || []), ...(answer.errors || []), ...(answer.warnings || [])].map(x => typeof x === 'string' ? x : JSON.stringify(x));
  if (answer.stale_render) {
    const sr = answer.stale_render;
    problems.unshift(`cut against an earlier render: the map expects ${String(sr.expected || '').slice(0, 12)}…, the registry has ${String(sr.registry || '').slice(0, 12)}…, the file on disk ${String(sr.disk || '').slice(0, 12)}… — boxes may sit on moved pages`);
  }
  for (const r of rows) for (const v of r.violations || []) problems.push(`row ${r.line || '?'} (${r.unit_id || r.unit}): ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  // P53: the printed forms no row covers ride their own list — the answer's
  // `warnings` does not repeat them, its counts() does count them
  const coverage = (answer.coverage || []).map(x => typeof x === 'string' ? x : JSON.stringify(x));
  // P55: a gap answered with a REASON in meta.json leaves `coverage` for
  // `coverage_answered` ("stamped page 12: '§ 326' (n=1) — the reason") and
  // counts for nothing; the window shows it greyed with its reason
  const coverageAnswered = (answer.coverage_answered || []).map(x => typeof x === 'string' ? x : JSON.stringify(x));
  return { rows, problems, coverage, coverageAnswered, absent: false, meta: answer.meta || null };
}
function rowFromJson(j) {
  const r = {
    src_doc: j.src_doc, src_page: +j.src_page, src_quote: j.text ?? j.src_quote ?? '', src_occ: +(j.n ?? j.src_occ ?? 1) || 1,
    kind: j.kind || '', target_doc: j.target_doc || '', target_page: j.target_page == null || j.target_page === '' ? null : +j.target_page,
    target_page_end: j.target_page_end == null || j.target_page_end === '' ? null : +j.target_page_end,
    target_label: j.target_pin ?? j.target_label ?? '', status: j.status || 'mapped', by: j.by || '', note: j.note || '',
    target_quote: j.target_quote || '', line: j.line || 0, violations: j.violations || [], warnings: j.warnings || [],
    // the registry's own mapping when the server did it (pdf = own page + offset; pagemap wins)
    src_pdf_page: j.src_pdf_page ?? null, target_pdf_page: j.target_pdf_page ?? null, target_pdf_page_end: j.target_pdf_page_end ?? null,
    target_known: j.target_known,
    // P89 (studio-spec 7d866ecf 694d1680): the target pages of this row's span the checker's P83 detector reads as two-column — [] none, null not measured, absent (a served process before the landing) → null
    target_columns: Array.isArray(j.target_columns) ? j.target_columns.map(Number).filter(Number.isFinite) : null,
    target_ligature_drop: typeof j.target_ligature_drop === 'boolean' ? j.target_ligature_drop : null,   // P95: the checker's document fact, per row
    // P66: how a statute pin resolved through the target's SECTION map, when the registry did ({pdf, by, key, file})
    target_pin_page: j.target_pin_page && typeof j.target_pin_page === 'object' ? j.target_pin_page : null,
  };
  if (j.unit_id) r.unit_id = j.unit_id;
  if (j.k) r.k = +j.k;
  r.unit = `${r.src_page}/${r.src_occ}`;
  return r;
}

// ---------------------------------------------------------------- mount
export function mountCaseReview(opts = null) {
  const root = $('#casereviewRoot');
  if (!root || st.mounted) return;
  st.mounted = true;
  st.hostRoot = opts && typeof opts.root === 'string' && opts.root.trim() ? opts.root.trim() : null;   // → ?root=<slug> on the three fetches
  try { st.split = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, +localStorage.getItem(SPLIT_KEY) || 50)); } catch {}
  try { st.navW = Math.min(900, Math.max(180, +localStorage.getItem(NAV_KEY) || 260)); } catch {}
  // NO HEADER BAR (the owner's word 2026-09-30 04:16 CDT, with a screenshot: "remove the Case review line, its wasted
  // space; the page and statistics are not needed") — the title, the tagline and the page/unit/row counts are gone and
  // the panes take the height.
  // NO PANE HEADER EITHER (the owner's word 2026-09-30 ~04:5x CDT): "a footer for each pdf pane like we have for the tmux
  // session panes … move the page buttons to the footer. Remove the BOXES p. N/N. and move the details at the top of
  // the pdf pane into a menu with three dots … make the search bar open up from a single button … in the top right
  // corner of the pdf viewer itself". So each pane is: the notes drawer (closed) · the viewer · the problems (closed) ·
  // a 32 px FOOTER shaped like workspace.js's .ws-pane-foot — the pane key, the document's name as a chip that gives
  // way, the status (left) or what opened (right) as the elastic chip, the citation stepper (left), the page buttons.
  // ⋯ sits in the footer beside the name, where the tmux pane footer has it (the owner's screenshot 04:39 CDT); ⌕ floats
  // in the viewer's top-right corner; ⋯ opens the deck's shared menu with the document's name and
  // status, its notes, the highlights toggle, open-in-the-other-pane, the link map's problems, and the citations on
  // this page (the chips strip that used to sit above the page). The h key and ⌘F keep their bindings.
  root.innerHTML = `<div class="cr-page">
    <div class="cr-body" id="crBody" style="--cr-nav:${st.navW}px;--cr-split:${st.split}%">
      <nav class="cr-nav" id="crNav" aria-label="DDC filings">
        <div class="cr-navhead">
          <input id="crFilter" class="cv-search cr-filter" type="search" placeholder="filter…" autocomplete="off" spellcheck="false" aria-label="filter the filings">
          <button class="row-act cr-navact" id="crCollapseAll" data-act="collapseall" title="collapse all — close every filing's attachments and clear the filter">⊟</button>
          <div class="cr-navopts">
            <label class="cr-hideopt" title="hide the filings docketed before this number — attachments follow their main; the hidden set is this sidebar's only: a citation still opens its target in the pane"><input type="checkbox" id="crHideOn"> hide before ECF <input type="number" id="crHideBefore" min="1" max="9999" placeholder="none" aria-label="docket number the list starts at (empty: nothing hidden)"></label>
            <button class="row-act cr-navact cr-hiddenn" id="crShowHidden" data-act="showhidden" title="show the hidden rows, dimmed, to right-click them back into the list">0 hidden</button>
          </div>
        </div>
        <div class="cr-navlist" id="crNavList"><div class="cr-empty">loading the registry…</div></div>
      </nav>
      <div class="cr-navsplit" id="crNavSplit" role="separator" aria-orientation="vertical" title="drag to resize the filings list"><button class="vsplit-collapse cr-navcollapse" id="crNavCollapse" data-act="navrail" title="collapse/expand the filings list — or drag the border all the way in; double-click resets the width">◂</button></div>
      <section class="cr-pane cr-left" id="crLeft" aria-label="document under review">
        <div class="cr-notes" id="crNotesLeft" hidden>
          <div class="cr-noteshead"><span class="cr-noteslabel">notes</span><span class="cr-notesstatus"></span><span class="cr-spacer"></span><button class="cr-btn" data-act="notesdispatch" data-pane="left" title="send this note (the selection, else the whole of it) to a seat or a team through the deck's review composer">dispatch…</button><button class="cr-btn" data-act="notesclose" data-pane="left" title="close the notes (they save as you type)">×</button></div>
          <textarea class="cr-notestext" spellcheck="true" aria-label="notes for the document under review"></textarea>
        </div>
        <div class="cr-viewer">
          <div class="cr-well" id="crLeftWell"><div class="cr-empty">The left pane is the document under review. Click a filing in the list to open it here; its citations are boxed on the page and listed in the ⋯ menu.</div></div>
          <div class="cr-corner" id="crCornerLeft">
            <button class="cr-btn cr-searchbtn" data-act="search" data-pane="left" title="search this document (phrases, case-insensitive; ⌘F)">⌕</button>
            <div class="cr-search" id="crSearchLeft" hidden><input type="search" placeholder="search the document under review…" aria-label="search the document under review"><span class="cr-searchn"></span><button class="cr-btn" data-act="hitprev" data-pane="left" title="previous hit (⇧↩)">↑</button><button class="cr-btn" data-act="hitnext" data-pane="left" title="next hit (↩)">↓</button><button class="cr-btn" data-act="searchclose" data-pane="left" title="close (esc)">×</button></div>
          </div>
        </div>
        <div class="cr-problems" id="crProblems" hidden></div>
        <footer class="cr-foot">
          <span class="cr-panekey is-left" title="the document under review"></span>
          <span class="cr-footchip cr-panetitle" id="crLeftTitle">no document — pick a filing in the list</span>
          <button class="cr-btn cr-morebtn" data-act="more" data-pane="left" title="this document — its name and status, notes, the highlights, the citations on this page">⋯</button>
          <span class="cr-footchip cr-status" id="crStatus" aria-live="polite"></span>
          <button class="cr-probn" id="crProbN" data-act="problems" hidden title="the link map's problems and the printed forms with no row — show or hide the list"></button>
          <span class="cr-spacer"></span>
          <span class="cr-stepper" id="crStepper" role="group" aria-label="step through the citations">
            <button class="cr-btn" data-act="prev" title="previous citation (⌥←)">‹</button>
            <span class="cr-stepn" id="crStepN" title="the citation under the stepper, of every citation the link map rows">—</span>
            <button class="cr-btn" data-act="next" title="next citation (⌥→)">›</button>
          </span>
        </footer>
      </section>
      <div class="cr-split" id="crSplit" role="separator" aria-orientation="vertical" title="drag to resize the panes"></div>
      <section class="cr-pane cr-right" id="crRight" aria-label="reference at its primary source">
        <div class="cr-notes" id="crNotesRight" hidden>
          <div class="cr-noteshead"><span class="cr-noteslabel">notes</span><span class="cr-notesstatus"></span><span class="cr-spacer"></span><button class="cr-btn" data-act="notesdispatch" data-pane="right" title="send this note (the selection, else the whole of it) to a seat or a team through the deck's review composer">dispatch…</button><button class="cr-btn" data-act="notesclose" data-pane="right" title="close the notes (they save as you type)">×</button></div>
          <textarea class="cr-notestext" spellcheck="true" aria-label="notes for the reference"></textarea>
        </div>
        <div class="cr-tabs" id="crTabs" role="tablist" aria-label="the reference pane's tabs" hidden></div>
        <div class="cr-viewer">
          <div class="cr-well" id="crRightWell"></div>
          <div class="cr-corner" id="crCornerRight">
            <button class="cr-btn cr-searchbtn" data-act="search" data-pane="right" title="search the reference (phrases, case-insensitive; ⌘F)">⌕</button>
            <div class="cr-search" id="crSearchRight" hidden><input type="search" placeholder="search the reference…" aria-label="search the reference"><span class="cr-searchn"></span><button class="cr-btn" data-act="hitprev" data-pane="right" title="previous hit (⇧↩)">↑</button><button class="cr-btn" data-act="hitnext" data-pane="right" title="next hit (↩)">↓</button><button class="cr-btn" data-act="searchclose" data-pane="right" title="close (esc)">×</button></div>
          </div>
        </div>
        <footer class="cr-foot">
          <span class="cr-panekey is-right" title="the reference at its primary source"></span>
          <span class="cr-footchip cr-panetitle" id="crRightTitle">reference pane</span>
          <button class="cr-btn cr-morebtn" data-act="more" data-pane="right" title="the reference — its name, what opened, notes, the highlights, review it on the left">⋯</button>
          <span class="cr-says" id="crSays" title="Click a boxed citation on the left, or step through them with ‹ ›, to open its primary source here at the cited page.">Click a boxed citation on the left, or step through them with ‹ ›, to open its primary source here at the cited page.</span>
        </footer>
      </section>
    </div>
  </div>`;
  st.left.pane = createPdfPane($('#crLeftWell'), { onPage: (p) => { st.left.page = p; renderCites(); pushHash(); }, onBoxClick: (b) => openFrom('left', b.unit, 1) });
  st.tabs.bar = tabsEmpty(); activateTab(st.tabs.bar.active, { save: false });
  bindTabs();
  bindSplitters(root);
  bindNavTree();
  bindSearch('left'); bindSearch('right');
  bindNotes('left'); bindNotes('right');
  window.addEventListener('pagehide', () => { notesFlush('left'); notesFlush('right'); });
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  // the state rides ?casereview=<state> (R1: the shell owns the hash);
  // back/forward never touch it (replaceState), a pasted URL restores at mount
  st.source = pickSource();
  if (st.source.kind === 'fixture') $('#crSub').textContent = `fixture lane: ${st.source.base}`;
  loadDocs().then(() => { const s = readState(); if (s) restoreFromHash(s); });
}
function readState() {
  const v = new URLSearchParams(location.search).get('casereview');
  return v ? parseHash(v) : null;
}

async function loadDocs() {
  setStatus('reading the registry…');
  try {
    const d = await st.source.docs();
    if (d && d.unavailable) { $('#crNavList').innerHTML =`<div class="cr-empty">${esc(d.unavailable)}</div>`; setStatus(''); return; }
    st.docs = (d && d.docs) || [];
    st.caseRoot = (d && d.case_root) || (st.source.base || '');
    { const nv = d && d.registry && d.registry.nav; const hb = nv && typeof nv === 'object' ? +nv.hide_before : NaN; st.nav.hideDefault = Number.isFinite(hb) && hb > 0 ? hb : null; }
    loadTree();
    // the docs answer carries per-document link counts ({links: {id: {rows, mapped, verified, unresolved, ok}}})
    const lk = (d && d.links) || {};
    for (const x of st.docs) { const c = lk[x.id]; if (c && (c.rows || 0) > 0) x.has_links = true; if (c) x.link_counts = c; }
    st.byId = new Map(st.docs.map(x => [x.id, x]));
    restoreTabs();
    setStatus('');
    renderNav();
  } catch (e) {
    $('#crNavList').innerHTML =`<div class="cr-empty">registry failed — ${esc(String(e.message || e))}</div>`;
    setStatus('');
  }
}

// ---------------------------------------------------------------- nav
// ---------------------------------------------------------------- the tree
// THE FILINGS NAV AS A TREE (owner 2026-09-29 22:05 CDT, verbatim: "Lets have
// the ECF files be listed in descending order with the attachments (N-NN)
// nested under their main document (ECF N) … and have it look and function
// more like the ide sidebar navigation (can be expanded or minimized
// liberally)"; studio-spec 7d866ecf's spec, six points). The order is the
// core's (navRows: mains descending, attachments ascending under their
// parent, Minute Order last). Here: parents COLLAPSED by default with the
// attachment count on the row; expanding one never collapses another; the
// open documents' parents auto-expand and scroll into view; the groups fold
// like directories (Filings open, the reference groups closed — 832 rows
// today, the reference side opens from citations); the IDE header idiom —
// `filter…` (cv-search) over label + title auto-expanding matching parents,
// collapse-all ⊟ closing every node and clearing the filter — and the nav
// folding to a rail ◂ so the two panes take the width. The expanded set,
// the open groups and the rail ride localStorage per case root.
const TREE_KEY = (root) => `ourstudio_cr_tree:${root || WIN_ID || 'default'}`;
function loadTree() {
  st.nav.key = TREE_KEY(st.caseRoot || st.hostRoot);
  st.nav.hideBefore = st.nav.hideDefault;
  try {
    const j = JSON.parse(localStorage.getItem(st.nav.key) || 'null');
    if (j && typeof j === 'object') {
      st.nav.open = new Set(Array.isArray(j.open) ? j.open : []);
      st.nav.groups = new Set(Array.isArray(j.groups) ? j.groups : ['Filings']);
      st.nav.rail = !!j.rail;
      st.nav.hidden = new Set(Array.isArray(j.hidden) ? j.hidden : []);
      st.nav.pins = new Set(Array.isArray(j.pins) ? j.pins : []);
      if ('hideBefore' in j) st.nav.hideBefore = Number.isFinite(+j.hideBefore) && +j.hideBefore > 0 ? +j.hideBefore : null;   // a cleared box is a choice too
      if (typeof j.hideOn === 'boolean') st.nav.hideOn = j.hideOn;
      if (typeof j.boxes === 'boolean') st.nav.boxes = j.boxes;
      st.tabs.stored = j.tabs || null;   // the bar (P88): applied once the registry is known — restoreTabs()
    }
  } catch {}
  applyRail(); syncNavOpts(); applyBoxes();
}
function saveTree() {
  try { localStorage.setItem(st.nav.key, JSON.stringify({ open: [...st.nav.open], groups: [...st.nav.groups], rail: st.nav.rail,
    hidden: [...st.nav.hidden], pins: [...st.nav.pins], hideBefore: st.nav.hideBefore, hideOn: st.nav.hideOn, boxes: st.nav.boxes,
    tabs: st.tabs.bar ? tabsSerialize(st.tabs.bar) : null })); } catch {}
}
/** The options row above the list reflects the store (per case root). */
function syncNavOpts() {
  const on = $('#crHideOn'), n = $('#crHideBefore');
  if (on) on.checked = !!st.nav.hideOn;
  if (n && document.activeElement !== n) n.value = st.nav.hideBefore == null ? '' : String(st.nav.hideBefore);
}
function toggleShowHidden(force) { st.nav.showHidden = force == null ? !st.nav.showHidden : !!force; renderNav(); }
/** Right-click on a row: the hidden set, by document (owner 2026-09-30). */
function onNavMenu(ev) {
  const row = ev.target.closest('.cr-row[data-id]');
  if (!row || row.dataset.series) return;
  const id = row.dataset.id, doc = st.byId.get(id);
  if (!doc) return;
  ev.preventDefault(); ev.stopPropagation();
  const label = doc.label || id;
  const after = () => { saveTree(); renderNav(); };
  const items = [];
  if (st.nav.hidden.has(id)) items.push({ label: `show ${label} in the list`, run: () => { st.nav.hidden.delete(id); after(); } });
  else if (row.dataset.hidden) items.push({ label: `keep ${label} in the list (it is below ECF ${st.nav.hideBefore})`, run: () => { st.nav.pins.add(id); after(); } });
  else if (st.nav.pins.has(id)) items.push({ label: `stop keeping ${label} (let the threshold hide it)`, run: () => { st.nav.pins.delete(id); after(); } });
  else items.push({ label: `hide ${label} from the list`, run: () => { st.nav.hidden.add(id); st.nav.pins.delete(id); after(); } });
  items.push({ sep: true });
  items.push({ label: st.nav.showHidden ? 'hide the hidden rows again' : 'show the hidden rows (dimmed)', run: () => toggleShowHidden() });
  if (st.nav.hidden.size) items.push({ label: `clear the hidden list (${st.nav.hidden.size})`, run: () => { st.nav.hidden = new Set(); after(); } });
  showCtx(ev.clientX, ev.clientY, items);
}
/** The highlight boxes' PAINT on both panes (the owner's button): off = a class on .cr-page that unpaints every
 *  .cr-box while its hit area stays — every citation remains clickable, the one under the pointer shows itself. */
function applyBoxes() {
  const page = $('.cr-page'); if (!page) return;
  page.classList.toggle('is-noboxes', !st.nav.boxes);
  const b = $('#crBoxes'); if (b) { b.classList.toggle('is-on', !st.nav.boxes); b.setAttribute('aria-pressed', st.nav.boxes ? 'false' : 'true'); b.title = st.nav.boxes ? 'hide the highlight boxes — every citation stays clickable (h)' : 'show the highlight boxes again (h)'; }
}
function toggleBoxes() { st.nav.boxes = !st.nav.boxes; saveTree(); applyBoxes(); }
function applyRail() {
  const page = $('.cr-page'); if (!page) return;
  page.classList.toggle('is-navrail', st.nav.rail);
  // the nav column is an INLINE variable on #crBody (the splitter writes it), so the rail must write it too — a stylesheet rule loses to it
  const body = $('#crBody'); if (body) body.style.setProperty('--cr-nav', st.nav.rail ? '0px' : `${st.navW}px`);
  const b = $('#crNavCollapse'); if (b) { b.textContent = st.nav.rail ? '▸' : '◂'; b.title = st.nav.rail ? 'expand the filings list' : 'collapse the filings list to a rail'; }
}
function bindNavTree() {
  const f = $('#crFilter');
  if (f) f.addEventListener('input', () => { st.nav.filter = f.value; renderNav(); });
  const on = $('#crHideOn'), n = $('#crHideBefore'), list = $('#crNavList');
  if (on) on.addEventListener('change', () => { st.nav.hideOn = on.checked; saveTree(); renderNav(); });
  if (n) n.addEventListener('change', () => { const v = parseInt(n.value, 10); st.nav.hideBefore = Number.isFinite(v) && v > 0 ? v : null; syncNavOpts(); saveTree(); renderNav(); });
  if (list) list.addEventListener('contextmenu', onNavMenu);
}
function toggleFold(id, force) {
  const open = force == null ? !st.nav.open.has(id) : !!force;
  if (open) st.nav.open.add(id); else st.nav.open.delete(id);
  saveTree(); renderNav();
}
function toggleGroup(g, force) {
  const open = force == null ? !st.nav.groups.has(g) : !!force;
  if (open) st.nav.groups.add(g); else st.nav.groups.delete(g);
  saveTree(); renderNav();
}
function collapseAll() {
  st.nav.open = new Set(); st.nav.groups = new Set(['Filings']); st.nav.filter = '';
  const f = $('#crFilter'); if (f) f.value = '';
  saveTree(); renderNav();
}
function toggleRail() { st.nav.rail = !st.nav.rail; saveTree(); applyRail(); }
/** A NEWLY opened document's parent expands and its group opens (both
 *  panes' documents), and its row scrolls into view after the render —
 *  once, at the open: a later collapse-all or a fold by hand stands, and a
 *  folded parent then carries the pane's mark for the document inside it. */
function revealOpen(rows) {
  const byId = new Map(rows.filter(r => !r.group).map(r => [r.id, r]));
  const fresh = [];
  for (const side of ['left', 'right']) {
    const id = st[side].id;
    if (!id || st.nav.revealed[side] === id) continue;
    st.nav.revealed[side] = id; fresh.push(id);
    const r = byId.get(id);
    if (r) { if (r.parent) st.nav.open.add(r.parent); if (r.inGroup) st.nav.groups.add(r.inGroup); }
  }
  return fresh;
}
function renderNav() {
  const nav = $('#crNavList');
  const rows = navRows(st.docs, { left: st.left.id, right: st.right.id });
  const fresh = revealOpen(rows);
  // THE DRAWN TREE is core's (navView, lifted 2026-10-01 for the websites' shell): every flag — the filter's matches and
  // their expanded parents, THE HIDDEN SET (owner 2026-09-30: the threshold and the ids by hand; an open document draws
  // although hidden, a filter match draws although hidden — both marked), a folded parent's pane marks, a group's shown
  // and hidden counts — is decided there; this shell prints the items in its markup
  const view = navView(rows, { filter: st.nav.filter, hidden: st.nav.hidden, hideOn: st.nav.hideOn, hideBefore: st.nav.hideBefore, showHidden: st.nav.showHidden,
                               open: st.nav.open, groups: st.nav.groups, pins: st.nav.pins, left: st.left.id, right: st.right.id });
  if (view.empty === 'none') { nav.innerHTML = '<div class="cr-empty">the registry lists no documents</div>'; return; }
  const hb = $('#crShowHidden'); if (hb) { const nh = view.hiddenCount; hb.textContent = `${nh} hidden`; hb.classList.toggle('is-on', st.nav.showHidden); hb.hidden = !nh && !st.nav.showHidden; }
  const html = [];
  for (const it of view.items) {
    if (it.type === 'group') {
      html.push(`<div class="cr-group${it.open ? ' is-open' : ''}" data-act="group" data-group="${esc(it.group)}" role="button" tabindex="0" title="${it.open ? 'fold' : 'unfold'} ${esc(it.group)}"><i class="cr-chev">›</i><span class="cr-groupname">${esc(it.group)}</span><span class="cr-groupn">${it.shown}${it.hidden ? `<i class="cr-grouphid" title="${it.hidden} hidden from the list — right-click a row or the '… hidden' button above">· ${it.hidden} hidden</i>` : ''}${it.inert ? `<i class="cr-grouphid" title="hide before ECF ${esc(String(st.nav.hideBefore))} would hide every filing in this group, so it hides none — set a lower number or clear it">· threshold ${esc(String(st.nav.hideBefore))} hides all, showing all</i>` : ''}</span></div>`);
      continue;
    }
    const { row: r, folder, open, hiddenRow, meta } = it;
    const cls = ['cr-row', `depth-${r.depth}`, folder ? 'is-folder' : '', open ? 'is-open' : '', r.series ? 'is-series' : '', hiddenRow ? 'is-hidden' : '', r.left ? 'is-left' : '', r.right ? 'is-right' : '', it.withinLeft ? 'has-left-within' : '', it.withinRight ? 'has-right-within' : '', r.unfiled ? 'is-unfiled' : '', r.hasLinks ? 'has-links' : ''].filter(Boolean).join(' ');
    // a SERIES folder is a nav row, not a document: click / Enter / →← fold and unfold it, nothing opens
    if (r.series) {
      html.push(`<div class="${cls}" data-id="${esc(r.id)}" data-series="1" role="button" tabindex="0" title="${esc(r.label)} — ${r.kids} exhibit${r.kids === 1 ? '' : 's'} · click, Enter, → or ←: ${open ? 'fold' : 'unfold'}">`
        + `<i class="cr-chev" data-act="fold" data-id="${esc(r.id)}" title="${open ? 'fold' : 'unfold'} ${r.kids} exhibit${r.kids === 1 ? '' : 's'}">›</i>`
        + `<span class="cr-dots"><i class="cr-dot l"></i><i class="cr-dot r"></i></span>`
        + `<span class="cr-rowlabel">${esc(r.label)}</span><span class="cr-rowtitle">${esc(r.title || '')}</span>`
        + '<span class="cr-rowpages"></span>'   // the title already says "N exhibits" — once (the meta cell stays for the grid)
        + `</div>`);
      continue;
    }
    const keys = folder ? (open ? ' · ←: fold the attachments' : ' · →: unfold the attachments') : (r.parent ? ' · ←: back to the main document' : '');
    const countsTitle = (c) => `link rows: ${c.verified || 0} verified · ${c.mapped || 0} mapped · ${c.unresolved || 0} unresolved`;
    html.push(`<div class="${cls}" data-id="${esc(r.id)}"${r.parent ? ` data-parent="${esc(r.parent)}"` : ''}${hiddenRow ? ' data-hidden="1"' : ''} role="button" tabindex="0" title="${esc(r.title || r.label)} — click: review it on the left · ⌥-click or →: open it on the right${keys}${hiddenRow ? ' · hidden from the list (right-click to change)' : ''}">`
      + (folder ? `<i class="cr-chev" data-act="fold" data-id="${esc(r.id)}" title="${open ? 'fold' : 'unfold'} ${r.kids} attachment${r.kids === 1 ? '' : 's'}">›</i>` : '<i class="cr-chev is-leaf"></i>')
      + `<span class="cr-dots"><i class="cr-dot l"></i><i class="cr-dot r"></i></span>`
      + `<span class="cr-rowlabel">${esc(r.label)}</span>`
      + `<span class="cr-rowtitle">${esc(r.title || '')}</span>`
      // ONE meta cell (the grid has one column for it): a folded parent shows its attachment count, dim; otherwise the link counts, else the page count
      + (meta.kind === 'kids' ? `<span class="cr-rowkids" title="${meta.n} attachment${meta.n === 1 ? '' : 's'} — unfold to list them${meta.counts ? ` · ${countsTitle(meta.counts)}` : ''}">${meta.n} att.</span>`
        : meta.kind === 'counts' ? `<span class="cr-rowcounts" title="${countsTitle(meta.counts)}${meta.counts.ok === false ? ' · problems' : ''}"><i class="v">${meta.counts.verified || 0}</i><i class="m">${meta.counts.mapped || 0}</i><i class="u">${meta.counts.unresolved || 0}</i></span>`
        : (meta.pages ? `<span class="cr-rowpages">${meta.pages}p</span>` : '<span class="cr-rowpages"></span>'))
      + `<button class="cr-toright" data-act="toright" data-id="${esc(r.id)}" title="open ${esc(r.label)} in the reference pane">→</button>`
      + `</div>`);
  }
  nav.innerHTML = html.join('') || '<div class="cr-empty">nothing matches the filter</div>';
  for (const id of fresh) { const el = nav.querySelector(`.cr-row[data-id="${CSS.escape(id)}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
}
/** The visible rows in order, for the arrow keys. */
function visibleRows() { return [...$('#crNavList').querySelectorAll('.cr-row, .cr-group')]; }
function navKey(ev) {
  const el = ev.target;
  const row = el.classList.contains('cr-row') ? el : null, grp = el.classList.contains('cr-group') ? el : null;
  if (!row && !grp) return false;
  const k = ev.key;
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const all = visibleRows(); const i = all.indexOf(el); const next = all[i + (k === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
    return true;
  }
  if (grp) {
    if (k === 'ArrowRight') { toggleGroup(grp.dataset.group, true); return true; }
    if (k === 'ArrowLeft') { toggleGroup(grp.dataset.group, false); return true; }
    if (k === 'Enter' || k === ' ') { toggleGroup(grp.dataset.group); return true; }
    return false;
  }
  const folder = row.classList.contains('is-folder'), open = row.classList.contains('is-open');
  // a SERIES folder is not a document: the arrows only fold and unfold it (b0d76502's read of c4e371d6 — → on an open series reached openRight with the synthetic id)
  if (row.dataset.series && (k === 'ArrowRight' || k === 'ArrowLeft')) {
    if (k === 'ArrowRight' && !open) toggleFold(row.dataset.id, true);
    else if (k === 'ArrowLeft' && open) toggleFold(row.dataset.id, false);
    refocus(row.dataset.id); return true;
  }
  if (k === 'ArrowRight') {
    // the tree idiom: → unfolds a folded parent; otherwise it keeps "open on the right"
    if (folder && !open) { toggleFold(row.dataset.id, true); refocus(row.dataset.id); return true; }
    openRight(row.dataset.id, { page: 1 }); return true;
  }
  if (k === 'ArrowLeft') {
    if (folder && open) { toggleFold(row.dataset.id, false); refocus(row.dataset.id); return true; }
    const p = row.dataset.parent; if (p) refocus(p);
    return true;
  }
  return false;
}
function refocus(id) { const el = $('#crNavList').querySelector(`.cr-row[data-id="${CSS.escape(id)}"]`); if (el) el.focus(); }

// ---------------------------------------------------------------- open
async function openLeft(id, opts = {}) {
  const doc = st.byId.get(id);
  if (!doc) { setStatus(`${id} is not in the registry`); return; }
  { const away = publishedAway(doc, 'left'); if (away) { setStatus(away.parts.map((p) => p.text).join('')); return; } }
  st.left.id = id; st.left.doc = doc; st.left.links = null; st.left.units = null; st.active = null; st.left.problems = []; st.left.coverage = []; st.left.coverageAnswered = [];
  { const el = $('#crLeftTitle'); el.textContent = nameOf(doc); el.title = nameOf(doc); }
  st.left.here = [];
  $('#crStepN').textContent = '—';
  notesOnDoc('left');
  renderNav();
  setStatus(`opening ${doc.label || id}…`);
  let opened = null;
  try { opened = await st.left.pane.open(st.source.fileUrl(id)); }
  catch (e) { setStatus(`${doc.label || id}: ${e.message || e}`); return; }
  if (!opened || st.left.id !== id) return;
  // the links, if the document has a lane
  let answer = null;
  try { answer = await st.source.links(id); } catch (e) { st.left.problems.push(`links: ${e.message || e}`); }
  if (st.left.id !== id) return;
  const links = normaliseLinks(answer);
  st.left.links = links;
  // (f28bb754's check 4) a map cut against another render: boxes still drawn, marked APPROXIMATE
  st.left.stale = links.problems.some(p => /cut against an earlier render/.test(String(p)));
  st.left.units = unitsOf(links.rows);
  st.left.problems.push(...links.problems);
  st.left.coverage = links.coverage || [];
  st.left.coverageAnswered = links.coverageAnswered || [];
  renderProblems();
  const n = st.left.units.units.length;
  // the counts are not said (the owner, 2026-09-30: "the page and statistics are not needed"); a missing link map still is
  setStatus(links.absent ? `${doc.label || id}: no link map yet` : '');
  await boxAllUnits(id);
  if (opts.page) st.left.pane.focus(opts.page, 0);
  renderCites();
  if (opts.cite) {
    const hit = unitForCite(st.left.units, opts.cite);
    if (hit) {
      if (hit.assumed) setStatus(`the link named stamped page ${opts.cite.page} without its citation's text — opened the first citation on that page (${hit.unit.text})`);
      openFrom('left', hit.unit, opts.cite.k || 1, { step: true });
    } else setStatus(`the link's citation (page ${opts.cite.page}, n ${opts.cite.n}${opts.cite.q ? `, "${opts.cite.q}"` : ''}) is not in this document's link map`);
  }
  pushHash();
}

/** Locate and paint every unit's box on its page (one text read per page). `side` = the pane whose table it is (P87: the right
 *  pane draws its own citation boxes too; its missing units are not listed — the problems list is the left document's). */
async function boxAllUnits(id, side = 'left', S = side === 'left' ? st.left : st.right) {
  const pane = S.pane;
  const { byPage } = S.units;
  // FINDING 6 (b0d76502's live read of the nine smaller renders, 2026-09-29;
  // admins' README clause (3), work_station 63ba0ec3): an IMAGE-ONLY filing
  // under review (text_layer: false — the Whittick declarations, ECF 72-1
  // and 73-3) has its rows anchored on the OCR mirror; the checker reads
  // them and says ok, the window lists the citations, boxes none, says so
  // ONCE at the top of the list and keeps stepping — never a per-unit "not
  // located" (the window said it three hundred times per declaration).
  if (S.doc && S.doc.text_layer === false) {
    if (side !== 'left') return;
    const n = S.units.units.length;
    st.left.problems.unshift(`an image-only scan: its ${n} citation${n === 1 ? '' : 's'} are listed from the OCR mirror and none can be boxed on the page — step through them with ‹ ›, each still opens its source`);
    renderProblems();
    return;
  }
  const boxesByPage = new Map();
  const touched = new Set();
  for (const [stamped, units] of byPage) {
    const pdfPage = pdfPageFor(stamped, S.doc.offset, S.doc.pagemap);
    if (!pdfPage) { for (const u of units) u.missing = 'unstamped document — no page mapping'; continue; }
    for (const u of units) {
      let parts = null;
      try { parts = await pane.locateParts(pdfPage, u.text, u.n); } catch {}
      if (S.id !== id) return;
      if (!parts || !parts.length) { u.missing = `"${u.text}" (occurrence ${u.n}) was not found on stamped page ${stamped}`; continue; }
      // a unit is ONE box in parts-per-page: focus and the stepper use parts[0]
      u.parts = parts; u.pdfPage = parts[0].page; u.rects = parts[0].rects;
      const wrapped = parts.some(p => p.wrapped);
      const box = { id: u.key, unit: u, status: unitStatus(u), approx: !!S.stale, title: `${u.text} → ${u.targets.map(t => `${t.target_doc || '?'} ${t.target_label || ''}`).join(' · ')}` + (wrapped ? ' — wraps to the next page past the footnotes' : '') + (S.stale ? ' — approximate: the map was cut against an earlier render' : '') };
      for (const part of parts) {
        if (!boxesByPage.has(part.page)) boxesByPage.set(part.page, []);
        boxesByPage.get(part.page).push({ ...box, rects: part.rects, span: part.span });
        touched.add(part.page);
      }
    }
    // INCREMENTAL (measured on the real ECF 74, 2026-09-29: 588 units over 60
    // pages took 8.8 s to the first box when every page painted at the end):
    // a page's boxes paint as soon as its units are located
    for (const pg of touched) paintSideBoxes(side, pg, boxesByPage.get(pg), S);
    touched.clear();
  }
  // N3's remainder (f28bb754): once boxes exist, the units walk in the order
  // they SIT on the page — box top, then left — not the file's row order; a
  // unit without a box follows the located ones of its page in row order
  const pageOf = (u) => pdfPageFor(u.page, S.doc.offset, S.doc.pagemap);
  S.units.units = orderByPosition(S.units.units, pageOf);
  for (const [pg, arr] of S.units.byPage) S.units.byPage.set(pg, orderByPosition(arr, pageOf));
  for (const [pg, boxes] of boxesByPage) paintSideBoxes(side, pg, boxes, S);
  if (side !== 'left') return;
  const missing = st.left.units.units.filter(u => u.missing);
  if (missing.length) { st.left.problems.push(...missing.map(u => `not located: ${u.missing}`)); renderProblems(); }
}
/** Paint a page's boxes on a pane: the left's are its units'; the RIGHT's are its units' MERGED with the passage highlight the
 *  left's citation pinned on that page (setBoxes replaces a page's boxes, so the pane's boxes-by-page carry both; P87). */
function paintSideBoxes(side, page, unitBoxes, S = side === 'left' ? st.left : st.right) {
  if (side === 'left') { st.left.pane.setBoxes(page, unitBoxes); return; }
  if (unitBoxes) S.boxesByPage.set(page, unitBoxes);
  const own = S.boxesByPage.get(page) || [], q = S.passage.get(page);
  S.pane.setBoxes(page, q ? [...own, q] : own);
}
/** A right TAB's passage highlight (its state S): cleared whole, or set on one page — the citation boxes of that page stay. */
function setRightPassage(S, page, box) {
  if (page == null) { const pages = [...S.passage.keys()]; S.passage.clear(); for (const p of pages) paintSideBoxes('right', p, null, S); return; }
  S.passage.set(page, box); paintSideBoxes('right', page, null, S);
}

/** Open a document in the RIGHT pane = in the EXPLORING tab (P88, invariant 3: every link lands there; a document already
 *  locked in a tab gets a second view here and the locked view stays at its page). The bar records the open. */
async function openRight(id, opts = {}) {
  const doc = st.byId.get(id);
  if (!doc) { says(`${id} is not in the registry — nothing opened.`, 'bad'); return false; }
  // a row this host does not serve (publish link | hold, path null — the site bundle): core's words, no fetch (the Studio's rows carry paths)
  { const away = publishedAway(doc); if (away) { sayParts(away); return false; } }
  let x = tabsExploring(st.tabs.bar);
  if (!x) { st.tabs.bar = tabsOpen(st.tabs.bar, { doc: null }); x = tabsExploring(st.tabs.bar); }
  activateTab(x.id, { save: false });
  const S = st.right;
  const ok = await openInto(S, id, opts);
  if (!ok) return false;
  st.tabs.bar = tabsOpen(st.tabs.bar, { doc: id, page: S.page || opts.page || 1 });
  renderTabs(); saveTree();
  return true;
}
/** Open document `id` into tab state S (the pane, the title chip when S is active, the marked pages, the focus) and load its
 *  own citation table (P87). The same path for the exploring tab's open and a locked tab's lazy restore after a reload. */
async function openInto(S, id, opts = {}) {
  const doc = st.byId.get(id);
  if (!doc) return false;
  const same = S.id === id && S.pane.doc;
  S.id = id; S.doc = doc;
  if (S === st.right) { const el = $('#crRightTitle'); el.textContent = nameOf(doc); el.title = nameOf(doc); }
  S.reviewable = !!(doc.has_links || st.source.kind === 'fixture');
  if (S === st.right) notesOnDoc('right');
  renderNav();
  if (!same) {
    S.links = null; S.units = null; S.boxesByPage = new Map(); S.passage = new Map(); S.stale = false;
    try { const o = await S.pane.open(st.source.fileUrl(id)); if (!o || S.id !== id) return false; }
    catch (e) { if (S === st.right) says(`${doc.label || id}: could not open — ${e.message || e}`, 'bad'); return false; }
  }
  const pages = opts.marked || [];
  S.pane.setMarked(pages);
  if (opts.page) { S.pane.focus(opts.page, 0); S.page = opts.page; }
  // P87 (the owner's word 2026-10-01): a right document WITH a table draws its own citation boxes — the same units, statuses,
  // highlights toggle and locate as the left — so its citations open in the right and the left never moves. A document
  // without a table draws the passage highlight alone. The table loads once per document, after the pane has it, through
  // the SAME st.source.links path (a 404 is null → nothing drawn — the sites' static route).
  if (!same && doc.has_links && !S.units) {
    let answer = st.tabs.linkCache.get(id);
    if (answer === undefined) { try { answer = await st.source.links(id); } catch { answer = null; } st.tabs.linkCache.set(id, answer); }   // P88: one fetch per document across tabs
    if (S.id !== id) return false;
    if (answer) {
      const links = normaliseLinks(answer);
      S.links = links; S.stale = links.problems.some(p => /cut against an earlier render/.test(String(p)));
      S.units = unitsOf(links.rows);
      boxAllUnits(id, 'right', S);   // paints as pages locate; never awaited — the passage below lands first
    }
  }
  return true;
}

// ---------------------------------------------------------------- the tab bar (P88): the shell prints core's bar
/** The state object of a tab, made on first need: its own host inside the right well, its own pane (the page it is left at is
 *  the page it keeps — the pane itself remembers), its own P87 table/boxes/passage, its own chip words. */
function tabState(id) {
  let S = st.tabs.states.get(id);
  if (S) return S;
  const host = document.createElement('div'); host.className = 'cr-tabwell'; host.dataset.tab = id; host.hidden = true;
  $('#crRightWell').appendChild(host);
  S = { tabId: id, host, id: null, doc: null, page: 1, pane: null, links: null, units: null, boxesByPage: new Map(), passage: new Map(), stale: false, reviewable: false, says: null, opening: null };
  S.pane = createPdfPane(host, {
    onPage: (p) => { S.page = p; st.tabs.bar = tabsSetPage(st.tabs.bar, id, p); renderTabs(); saveTree(); pushHash(); },
    onBoxClick: (b) => openFrom('right', b.unit, 1, { tab: S }) });
  st.tabs.states.set(id, S);
  return S;
}
function disposeTab(id) {
  const S = st.tabs.states.get(id); if (!S) return;
  try { S.pane.destroy(); } catch {}
  S.host.remove(); st.tabs.states.delete(id);
}
/** Show tab `id`: its pane, its title, its chip words; the leaving tab keeps everything. A tab restored from the store opens
 *  its document lazily here, at its remembered page. */
function activateTab(id, { save = true } = {}) {
  const tab = tabsFind(st.tabs.bar, id); if (!tab) return;
  const cur = st.right;
  if (cur && cur.host) { cur.host.hidden = true; const el = $('#crSays'); cur.says = { html: el.innerHTML, cls: el.className, title: el.title }; }
  const S = tabState(id); st.right = S; S.host.hidden = false;
  st.tabs.bar = tabsActivate(st.tabs.bar, id);
  { const el = $('#crRightTitle'); const n = S.doc ? nameOf(S.doc) : 'reference pane'; el.textContent = n; el.title = n; }
  { const el = $('#crSays'); if (S.says) { el.innerHTML = S.says.html; el.className = S.says.cls; el.title = S.says.title; } else { el.className = 'cr-says'; el.textContent = tab.doc ? `${(st.byId.get(tab.doc) || {}).label || tab.doc} · page ${tab.page || 1}` : 'Click a boxed citation on the left, or step through them with ‹ ›, to open its primary source here at the cited page.'; el.title = el.textContent; } }
  notesOnDoc('right'); renderNav(); renderTabs();
  if (tab.doc && !S.pane.doc && !S.opening && st.byId.has(tab.doc)) {
    S.opening = openInto(S, tab.doc, { page: tab.page || 1 }).finally(() => { S.opening = null; });
  }
  if (save) saveTree();
}
function renderTabs() {
  const bar = $('#crTabs'); if (!bar || !st.tabs.bar) return;
  const shown = tabsShown(st.tabs.bar);
  bar.hidden = !shown;
  if (!shown) { bar.innerHTML = ''; return; }
  const view = tabsView(st.tabs.bar, (d) => (st.byId.get(d) || {}).label || d);
  bar.innerHTML = view.map((v) => {
    const cls = ['cr-tab', v.locked ? 'is-locked' : 'is-exploring', v.active ? 'is-active' : '', v.empty ? 'is-empty' : ''].filter(Boolean).join(' ');
    // two spans (7d866ecf's frame at a 490-px pane, 2026-10-02): the LABEL truncates, the PAGE stays — the page a tab is kept at is
    // the point of the bar and must never be hover-only ('ECF … · p. 12', not 'ECF 74 · p…')
    const text = v.empty ? '<span class="cr-tabtext">exploring — pick a citation in the left</span>' : `<span class="cr-tabtext">${esc(v.label)}</span>${v.page ? `<span class="cr-tabpage">· p. ${v.page}</span>` : ''}`;
    const title = v.empty ? 'the exploring tab: the next citation opens here' : `${esc(v.label)} at PDF page ${v.page || 1} — ${v.locked ? 'locked to the bar: stays here while the left explores' : 'the exploring tab: the next citation replaces it'} · right-click: ${v.locked ? 'unlock, close' : 'lock to tab bar, close'}`;
    return `<button class="${cls}" role="tab" aria-selected="${v.active}" data-act="tab" data-tab="${esc(v.id)}" title="${title}">${v.locked ? '<i class="cr-tablock" aria-label="locked">🔒</i>' : ''}${text}</button>`;
  }).join('');
}
function bindTabs() {
  const bar = $('#crTabs'); if (!bar) return;
  bar.addEventListener('contextmenu', onTabMenu);
}
function onTabMenu(ev) {
  const el = ev.target.closest('.cr-tab[data-tab]'); if (!el) return;
  ev.preventDefault(); ev.stopPropagation();   // the deck's menu hides on the document's click; this click is the one that opens it
  const id = el.dataset.tab, tab = tabsFind(st.tabs.bar, id); if (!tab) return;
  const items = [];
  if (tab.locked) items.push({ label: 'unlock — this becomes the exploring tab; the exploring tab closes', run: () => unlockTab(id) });
  else items.push({ label: 'lock to tab bar — keep this document at this page while the left explores', disabled: !tab.doc, run: () => lockTab(id) });
  items.push({ sep: true });
  items.push({ label: tab.locked ? 'close tab' : (tab.doc ? 'close tab (the slot stays for the next citation)' : 'close tab'), disabled: !tab.doc && !tab.locked, run: () => closeTab(id) });
  showCtx(ev.clientX, ev.clientY, items);
}
function lockTab(id) {
  const r = tabsLock(st.tabs.bar, id);
  if (r.refused) { says(esc(r.refused), 'bad'); return; }
  st.tabs.bar = r.bar; renderTabs(); saveTree();
}
function unlockTab(id) {
  const x = tabsExploring(st.tabs.bar);
  st.tabs.bar = tabsUnlock(st.tabs.bar, id);
  if (x && x.id !== id) disposeTab(x.id);
  activateTab(id);
}
function closeTab(id) {
  const tab = tabsFind(st.tabs.bar, id); if (!tab) return;
  st.tabs.bar = tabsClose(st.tabs.bar, id);
  disposeTab(id);   // a locked tab goes whole; the exploring slot gets a fresh empty state on activation
  activateTab(st.tabs.bar.active);
}
/** After the registry is known: the bar from the store (per case root), tabs on documents no longer served dropped. */
function restoreTabs() {
  const bar = tabsRestore(st.tabs.stored, (id) => st.byId.has(id));
  st.tabs.stored = null;
  for (const id of [...st.tabs.states.keys()]) if (!tabsFind(bar, id)) disposeTab(id);
  st.tabs.bar = bar;
  activateTab(bar.active, { save: false });
}

/** WHERE A ROW OPENS — a box clicked in `side` (P87; core.opensWhere decides, this shell prints): a TOC entry scrolls its own
 *  pane to the section and the other pane keeps its place; a citation in the LEFT opens in the RIGHT (openUnit, the anchor's
 *  path: active unit, stepper, the left's words); a citation in the RIGHT opens in the RIGHT with nothing of the left's changed. */
async function openFrom(side, u, k = 1, opts = {}) {
  if (!u) return;
  const w = opensWhere(u, side);
  if (w.where === 'same') return openToc(side, u, k, opts.tab || null);
  if (side === 'left') return openUnit(u, k, opts);
  return openUnitFromRight(u, k);
}
/** A TOC entry: scroll the pane it was clicked in to the section's page — the located heading when it is found (the heading
 *  row is the quote, README l.34 (TOC)), the page's top otherwise; nothing opens in the other pane. The pane's own chip says it. */
async function openToc(side, u, k, tab = null) {
  const S = side === 'left' ? st.left : (tab || st.right), pane = S.pane, doc = S.doc;   // P88: a right TOC entry scrolls ITS OWN tab
  const t = u.targets[Math.min(u.targets.length, Math.max(1, k)) - 1];
  if (side === 'left') { st.active = { unit: u, k }; markActiveBox(u); renderCites(); }
  const tp = targetPages(t, doc);
  if (!tp.pdfPage) { const r = saysFor(u, k, t, doc, tp); sayTo(side, r); return; }
  let parts = null;
  try { parts = t.target_quote ? await pane.locatePassage(tp.pdfPage, tp.pdfEnd || tp.pdfPage, t.target_quote, { ligatureDrop: ligatureDropFor(t) }) : null; } catch {}
  if (S.id !== doc.id) return;
  if (parts && parts.length) pane.focus(parts[0].page, (parts[0].rects[0].top / 100) * (pane.vp1.get(parts[0].page) || { height: 792 }).height);
  else pane.focus(tp.pdfPage, 0);
  if (side === 'left' || S === st.right) sayTo(side, saysFor(u, k, t, doc, { ...tp, passage: parts && parts.length ? parts : null, hasText: true, words: null }));
  pushHash();
}
/** THE EXCEPTION: a citation in the RIGHT document opens in the RIGHT — the same open path as the left's citation, with the
 *  right as the source: the left's document, page, active unit and stepper do not change; the way back is the left's citation. */
async function openUnitFromRight(u, k) {
  const t = u.targets[Math.min(u.targets.length, Math.max(1, k)) - 1];
  const doc = st.byId.get(t.target_doc) || null;
  const pre = saysFor(u, k, t, doc);
  if (!pre.opens) { sayParts(pre); pushHash(); return; }
  await openTarget(u, k, t, doc);
  pushHash();
}
/** Print a says result in a pane's own chip: the left's status line (text), the right's chip (markup). */
function sayTo(side, res) { if (side === 'left') setStatus(res.parts.map((p) => p.text).join('')); else sayParts(res); }

/** Open a unit's k-th target in the right pane; the left pane keeps its place
 *  (a citation changes the RIGHT pane only). */
async function openUnit(u, k = 1, opts = {}) {
  if (!u) return;
  const t = u.targets[Math.min(u.targets.length, Math.max(1, k)) - 1];
  st.active = { unit: u, k };
  markActiveBox(u);
  renderCites();
  if (!opts.fromHash && u.pdfPage && st.left.pane.current !== u.pdfPage) {
    // the stepper scrolls the LEFT pane to the box; a click on the box never moves it
    if (opts.step) st.left.pane.focus(u.pdfPage, (u.rects[0].top / 100) * (st.left.pane.vp1.get(u.pdfPage) || { height: 792 }).height);
  } else if (!opts.fromHash && u.missing && opts.step) {
    // no box to scroll to: the stepper goes to the row's page so the reader can look
    const pg = pdfPageFor(u.page, st.left.doc && st.left.doc.offset, st.left.doc && st.left.doc.pagemap);
    if (pg && st.left.pane.current !== pg) st.left.pane.focus(pg, 0);
  }
  // THE RIGHT PANE'S WORDS are core's (saysFor + targetPages, lifted 2026-10-01 for the websites' shell — one logic, two skins):
  // this shell prints the parts in its markup and opens what core says opens
  const doc = st.byId.get(t.target_doc) || null;
  const pre = saysFor(u, k, t, doc);
  if (!pre.opens) { sayParts(pre); pushHash(); return; }
  await openTarget(u, k, t, doc);
  pushHash();
}
/** Open a unit's target in the RIGHT pane and box its passage — the one path for a citation from either pane (P87). */
async function openTarget(u, k, t, doc) {
  const tp = targetPages(t, doc);
  const ok = await openRight(t.target_doc, { page: tp.pdfPage || 1, marked: tp.marked });
  if (!ok) return;
  const R = st.right;   // the exploring tab's state (P88): the passage and the words are its
  const head = saysFor(u, k, t, doc, tp);
  sayParts(head);
  setRightPassage(R, null);   // the former passage goes; the right document's own citation boxes stay
  if (head.locate) {
    // THE PASSAGE, WHOLE (README l.34, the owner's word 2026-09-30): the row's
    // quote is located over target_page … target_page_end (the page after for
    // the wrap only), fragments in order, and the WHOLE run is boxed on every
    // page it crosses — a middle page whole; retry (c) and the line-end join
    // (d) as the checker reads them (core.locatePassage, the fixture's
    // `passage` cases). The citation locate (locateParts) is the LEFT pane's.
    try {
      const parts = await R.pane.locatePassage(tp.pdfPage, tp.pdfEnd || tp.pdfPage, t.target_quote, { ligatureDrop: ligatureDropFor(t) });   // P95: the flag arms retry (g)
      if (R.id !== t.target_doc) return;   // the exploring tab moved on under the locate
      if (parts) {
        for (const part of parts) setRightPassage(R, part.page, { id: 'q', rects: part.rects, status: 'verified', title: t.target_quote });
        if (R === st.right) sayParts(saysFor(u, k, t, doc, { ...tp, passage: parts }));
      } else {
        // an image-only PAGE inside a text document, or a scrambled layer: core says which from the span's answers
        const hasText = await R.pane.spanHasText(tp.pdfPage, tp.pdfEnd || tp.pdfPage);
        const words = hasText === false ? null : await R.pane.passageWords(tp.pdfPage, tp.pdfEnd || tp.pdfPage, t.target_quote);
        // N3: the words of a miss name what was measured — the ORDER of the present words and whether the fold found a gutter
        const present = !!(words && words.total >= 5 && words.present >= 0.8 * words.total);
        const order = present ? await R.pane.passageOrder(tp.pdfPage, tp.pdfEnd || tp.pdfPage, t.target_quote) : null;
        // P89: the pane's own gutter read first; when it is false the SERVED fact — target_columns, the span pages the checker's
        // P83 detector reads as two-column (a West raw layer glues words across the gutter the pane cannot see; pdftotext's boxes can)
        const columns = present ? ((await R.pane.spanColumns(tp.pdfPage, tp.pdfEnd || tp.pdfPage)) || servedColumns(t, tp.pdfPage, tp.pdfEnd || tp.pdfPage)) : null;
        if (R === st.right) sayParts(saysFor(u, k, t, doc, { ...tp, passage: null, hasText, words, order, columns }));
      }
    } catch {}
  }
}
/** Print core's parts in this shell's markup: a live link, a warning span, plain text — escaped here. */
function sayParts(res) {
  says(res.parts.map((p) => p.href ? `<a href="${esc(p.href)}" target="_blank" rel="noopener">${esc(p.text)}</a>` : p.warn ? `<span class="cr-warn">${esc(p.text)}</span>` : esc(p.text)).join(''), res.kind);
}

function markActiveBox(u) {
  for (const btn of document.querySelectorAll('#crLeftWell .cr-box.is-active')) btn.classList.remove('is-active');
  if (u && u.pdfPage) for (const btn of document.querySelectorAll(`#crLeftWell .cr-hot[data-page="${u.pdfPage}"] .cr-box[data-id="${CSS.escape(u.key)}"]`)) btn.classList.add('is-active');
}

// ---------------------------------------------------------------- stepper
function step(dir) {
  // every unit steps, a missing box included (f28bb754's check 2): the
  // problem is listed, the target still opens, nothing is skipped silently
  const units = st.left.units && st.left.units.units;
  if (!units || !units.length) return;
  let i = st.active ? units.indexOf(st.active.unit) : -1;
  i = i < 0 ? (dir > 0 ? 0 : units.length - 1) : (i + dir + units.length) % units.length;
  openFrom('left', units[i], 1, { step: true });
}
function renderCites() {
  // the citations on this page are the ⋯ menu's list now (the owner's word 2026-09-30 ~04:5x CDT: the details above the
  // page into a menu); this keeps that list current and paints the stepper's counter in the footer
  if (!st.left.units) { st.left.here = []; $('#crStepN').textContent = '—'; return; }
  const all = st.left.units.units;
  const page = st.left.page;
  st.left.here = all.filter(u => u.pdfPage === page || (u.missing && pdfPageFor(u.page, st.left.doc && st.left.doc.offset, st.left.doc && st.left.doc.pagemap) === page));
  const idx = st.active ? all.indexOf(st.active.unit) : -1;
  $('#crStepN').textContent = all.length ? `${idx >= 0 ? idx + 1 : '–'} / ${all.length}` : '—';
}
function renderProblems() {
  const el = $('#crProblems');
  const p = st.left.problems || [], g = st.left.coverage || [], ga = st.left.coverageAnswered || [];
  // the list is closed by default (the owner's word: the space); the footer's count opens it, so does the ⋯ menu
  const any = p.length || g.length || ga.length;
  el.hidden = !any || !st.left.showProblems;
  const pb = $('#crProbN');
  if (pb) {
    pb.hidden = !any;
    pb.textContent = [p.length ? `${p.length} problem${p.length === 1 ? '' : 's'}` : '', g.length || ga.length ? `${g.length} gap${g.length === 1 ? '' : 's'}${ga.length ? ` (+${ga.length} answered)` : ''}` : ''].filter(Boolean).join(' · ');
    pb.classList.toggle('is-on', !el.hidden);
  }
  // P53: the rows that do NOT exist are their own group, never mixed into the
  // map's problems — a gap is answered with a row or a reason; a line names
  // its stamped page and a click goes there on the left
  const gap = (x, cls = '') => { const pg = gapPage(x); return pg ? `<li${cls} data-act="gapto" data-page="${pg}" title="go to stamped page ${pg} on the left">${esc(x)}</li>` : `<li${cls}>${esc(x)}</li>`; };
  // P55: the answered ones (a reason in meta.json) ride the same group, greyed, after the open ones
  const summary = `${g.length} printed form(s) with no row` + (ga.length ? ` · ${ga.length} answered with a reason` : '');
  el.innerHTML = (p.length ? `<details><summary>${p.length} problem(s) with this document's link map</summary><ul>${p.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '')
    + (g.length || ga.length ? `<details class="cr-coverage"><summary>${summary}</summary><ul>${g.map(x => gap(x)).join('')}${ga.map(x => gap(x, ' class="is-answered"')).join('')}</ul></details>` : '');
}

// ---------------------------------------------------------------- chrome
function nameOf(doc) { return `${doc.label || doc.id} — ${doc.title || ''}`; }
// THE PAGE BOX IS GONE (owner 2026-10-01 08:38 CDT, on the site's footers: "each has two page selectors — we only need
// the ‹ › selector"): the citation stepper is the footer's one control; pages turn by scrolling and the reference pane's
// sentence names the page it opened. The ⋯ menu still says the page under "this document".
function says(html, cls) { const el = $('#crSays'); el.innerHTML = html; el.className = 'cr-says' + (cls ? ` is-${cls}` : ''); el.title = el.textContent; }
function toggleProblems() { st.left.showProblems = !st.left.showProblems; renderProblems(); }

// ---------------------------------------------------------------- the ⋯ menu (the details that sat above the page)
function docOf(side) { return side === 'left' ? st.left.doc : st.right.doc; }
function openMore(side, ev, btn) {
  ev.stopPropagation();   // the deck's menu hides on the document's click; this click is the one that opens it
  const doc = docOf(side);
  const r = btn.getBoundingClientRect();
  const clip = (s, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const items = [];
  items.push({ label: doc ? clip(nameOf(doc)) : (side === 'left' ? 'no document under review' : 'nothing in the reference pane'), disabled: true });
  const line = (side === 'left' ? $('#crStatus').textContent : $('#crSays').textContent).trim();
  if (line) items.push({ label: clip(line), disabled: true });
  items.push({ sep: true });
  items.push({ label: doc ? `notes for ${doc.label || doc.id}…` : 'notes…', disabled: !doc, run: () => notesSetOpen(side, true) });
  items.push({ label: st.nav.boxes ? 'hide the highlights (h)' : 'show the highlights (h)', run: toggleBoxes });
  if (side === 'left' && doc) items.push({ label: `open ${doc.label || doc.id} in the reference pane →`, run: () => openRight(doc.id, { page: st.left.page || 1 }) });
  if (side === 'right' && doc && st.right.reviewable) items.push({ label: `review ${doc.label || doc.id} on the left ⇤`, run: () => openLeft(doc.id) });
  if (side === 'right' && st.tabs.bar) {   // P88: the active tab's bar actions, as the tab's right-click has them
    const tab = tabsFind(st.tabs.bar, st.tabs.bar.active);
    if (tab) { items.push({ sep: true }); if (tab.locked) items.push({ label: 'unlock this tab', run: () => unlockTab(tab.id) }); else items.push({ label: 'lock this tab to the tab bar', disabled: !tab.doc, run: () => lockTab(tab.id) }); if (tab.doc || tab.locked) items.push({ label: 'close this tab', run: () => closeTab(tab.id) }); }
  }
  if (side === 'left' && doc) {
    const p = st.left.problems || [], g = st.left.coverage || [], ga = st.left.coverageAnswered || [];
    if (p.length || g.length || ga.length) items.push({ label: `${st.left.showProblems ? 'hide' : 'show'} the link map's ${p.length} problem${p.length === 1 ? '' : 's'}${g.length || ga.length ? ` · ${g.length} form${g.length === 1 ? '' : 's'} with no row` : ''}`, run: toggleProblems });
    const here = st.left.here || [];
    const CAP = 14;
    items.push({ sep: true });
    if (here.length) {
      items.push({ label: `citations on this page (${here.length})`, disabled: true });
      for (const u of here.slice(0, CAP)) {
        const targets = u.targets.map(t => `${t.target_doc || '?'}${t.target_label ? ' ' + t.target_label : ''}`).join(', ');
        items.push({ label: clip(`${u.text}${u.n > 1 ? ` ×${u.n}` : ''} → ${targets}${u.missing ? ' (not boxed)' : ''}`), run: () => openFrom('left', u, 1, { step: true }) });
      }
      if (here.length > CAP) items.push({ label: `… ${here.length - CAP} more — step with ‹ ›`, disabled: true });
    } else items.push({ label: st.left.units && st.left.units.units.length ? 'no citations on this page' : 'no link map for this document yet', disabled: true });
  }
  showCtx(r.left, r.top - 4, items);   // from the footer: the deck's place() lifts the menu to fit above the window's bottom edge
}

// ---------------------------------------------------------------- notes (the ⋯ menu; the owner's word: "notes for that doc,
// which carry with that doc/authority/rule and can be dispatched to an agent, similar to the notes from word filings")
// The filings' own store and contract (editor/notes.js, api/filing/notes.py): one file per document at the project's
// .claude/doc_notes/<id>.md — keyed by the REGISTRY id (DDC-047, C-…, USB-…), so a note follows the document whichever
// pane shows it and every agent reads it; the string mtime token guards a save against an agent's edit (409 → rebase,
// the next keystroke overwrites deliberately). Autosave 1.2 s after typing; flushed on close, on a document change in
// the pane, and when the page hides. Dispatch = the deck's review composer with the selection (else the note) and the
// document named — the owner picks the seat or team there and sends.
const notes = { left: { id: null, token: null, dirty: false, timer: null }, right: { id: null, token: null, dirty: false, timer: null } };
function notesEl(side) { return $(side === 'left' ? '#crNotesLeft' : '#crNotesRight'); }
function notesQS(doc) { return `doc_id=${encodeURIComponent(doc.id)}&path=${encodeURIComponent(doc.path || '')}`; }
async function notesLoad(side) {
  const doc = docOf(side), box = notesEl(side); if (!doc || !box) return;
  const ta = box.querySelector('textarea'), status = box.querySelector('.cr-notesstatus'), label = box.querySelector('.cr-noteslabel');
  const n = notes[side]; n.id = doc.id; n.token = null; n.dirty = false;
  label.textContent = `notes — ${doc.label || doc.id}`; status.textContent = 'loading…';
  let d;
  try {
    const r = await fetch(`/api/notes?${notesQS(doc)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
    d = await r.json();
  } catch (e) { status.textContent = `notes load failed: ${e.message || e}`; return; }
  if (n.id !== doc.id) return;   // the pane moved on while loading
  n.token = d.mtime_token;
  ta.value = d.exists ? d.content : `# Notes — ${doc.label || doc.id}${doc.title ? ` · ${doc.title}` : ''}\n\nsource: ${doc.path || doc.id}\n\n`;
  status.textContent = d.exists ? '' : 'new — saves on first keystroke';
}
async function notesSaveNow(side) {
  const n = notes[side], box = notesEl(side); if (!n.id || !n.dirty || !box) return;
  const id = n.id, doc = st.byId.get(id);
  const ta = box.querySelector('textarea'), status = box.querySelector('.cr-notesstatus');
  const content = ta.value;
  let r, d;
  try {
    r = await fetch('/api/notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: id, path: doc ? doc.path : null, content, base_mtime_ns: n.token }) });
    d = await r.json().catch(() => ({}));
  } catch (e) { status.textContent = `save failed: ${e.message || e}`; return; }
  if (n.id !== id) return;   // the pane moved on; the save was for the earlier document and landed or said why
  if (r.status === 409) {
    // an agent wrote these notes since they were loaded — rebase the token; the NEXT save (the next keystroke, or the close) overwrites deliberately
    n.token = (d.detail && d.detail.current_mtime_token) || n.token;
    status.textContent = '⚠ notes changed on disk (an agent?) — the next keystroke overwrites with yours';
    return;
  }
  if (!r.ok) { status.textContent = `save failed: ${typeof d.detail === 'string' ? d.detail : r.status}`; return; }
  n.token = d.mtime_token; n.dirty = false;
  status.textContent = `saved ${new Date().toLocaleTimeString()}`;
  window.dispatchEvent(new CustomEvent('ourstudio:notes-changed'));
}
function notesFlush(side) { const n = notes[side]; if (n.timer) { clearTimeout(n.timer); n.timer = null; } return notesSaveNow(side); }
function notesSetOpen(side, open) {
  const box = notesEl(side); if (!box) return;
  if (open) { if (!docOf(side)) return; box.hidden = false; notesLoad(side).then(() => box.querySelector('textarea').focus()); }
  else { notesFlush(side); box.hidden = true; }
}
/** The pane's document changed: an open drawer flushes the old document's note and loads the new one. */
function notesOnDoc(side) {
  const box = notesEl(side); if (!box || box.hidden) return;
  const doc = docOf(side), n = notes[side];
  if (!doc || n.id === doc.id) return;
  if (n.id && n.dirty) notesFlush(side).then(() => notesLoad(side)); else notesLoad(side);
}
function notesDispatch(side) {
  const box = notesEl(side), doc = docOf(side); if (!box || !doc) return;
  const ta = box.querySelector('textarea'), status = box.querySelector('.cr-notesstatus');
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
  const body = (sel || ta.value).trim();
  if (!body) { status.textContent = 'nothing to dispatch — write or select a note first'; return; }
  const page = side === 'left' ? st.left.page : st.right.page;
  notesFlush(side);
  openReview(`${body}\n\n— from the Case Review window: ${doc.label || doc.id} (${doc.id}${doc.title ? `, ${doc.title}` : ''})${page ? `, PDF page ${page}` : ''}${doc.path ? `\n  file: ${doc.path}` : ''}`);
}
function bindNotes(side) {
  const box = notesEl(side); if (!box) return;
  const ta = box.querySelector('textarea');
  ta.addEventListener('input', () => { const n = notes[side]; n.dirty = true; clearTimeout(n.timer); n.timer = setTimeout(() => notesSaveNow(side), 1200); });
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); notesSetOpen(side, false); } });
}
function setStatus(t) { const el = $('#crStatus'); if (el) el.textContent = t || ''; }
function pushHash() {
  if (!st.left.id) return;
  // THE KEY IS WRITTEN ONLY WHILE THE WINDOW IS ON THIS SURFACE (50a58329's law: a
  // surface-naming key stands in the URL only while the surface is on screen; leaving
  // parks it). pushHash is reached asynchronously — a pdf.js render's onPage, the
  // mount's loadDocs().then(restoreFromHash) — so a render finishing after the owner
  // has left would put ?casereview= back off-surface and the next refresh would land
  // here again (the owner's word 2026-10-01). Off-surface, the state is the pane's own
  // until the owner returns; setMode restores the parked key then.
  if (document.body.dataset.mode !== 'casereview') return;
  const xr = st.tabs.bar ? tabsExploring(st.tabs.bar) : null;   // P88: right= names the EXPLORING tab; the locked tabs ride the store
  const url = urlForState(location.href, { doc: st.left.id,
    cite: st.active ? { page: st.active.unit.page, n: st.active.unit.n, k: st.active.k, q: st.active.unit.q } : null,
    page: st.left.page, right: xr && xr.doc ? xr.doc : null, rpage: xr && xr.doc ? (xr.page || 1) : null });
  if (url !== location.href) { try { history.replaceState(null, '', url); } catch {} }
}
async function restoreFromHash(h) {
  if (!h || !h.doc) return;
  if (h.right && h.right !== h.doc) await openRight(h.right, { page: h.rpage || 1 });
  await openLeft(h.doc, { page: h.page, cite: h.cite });
}

// ---------------------------------------------------------------- search
const search = { left: { hits: [], cur: -1, timer: null, q: '' }, right: { hits: [], cur: -1, timer: null, q: '' } };
function searchRow(side) { return $(side === 'left' ? '#crSearchLeft' : '#crSearchRight'); }
function paneOf(side) { return side === 'left' ? st.left.pane : st.right.pane; }
function bindSearch(side) {
  const row = searchRow(side);
  const input = row.querySelector('input');
  input.addEventListener('input', () => { clearTimeout(search[side].timer); search[side].timer = setTimeout(() => runSearch(side, input.value), 250); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); walkHits(side, ev.shiftKey ? -1 : 1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); toggleSearch(side, false); }
  });
}
function toggleSearch(side, on) {
  const row = searchRow(side);
  const show = on == null ? row.hidden : on;
  row.hidden = !show;
  row.parentElement.classList.toggle('is-open', show);   // the ⌕ button becomes the bar (the corner cluster)
  if (show) row.querySelector('input').focus();
  else { paneOf(side).clearHits && paneOf(side).clearHits(); search[side].hits = []; search[side].cur = -1; row.querySelector('.cr-searchn').textContent = ''; }
}
async function runSearch(side, q) {
  const pane = paneOf(side), row = searchRow(side), n = row.querySelector('.cr-searchn');
  search[side].q = q;
  if (!q || !q.trim() || !pane.doc) { pane.clearHits && pane.clearHits(); search[side].hits = []; search[side].cur = -1; n.textContent = ''; return; }
  n.textContent = 'searching…';
  const res = await pane.search(q, (p, of, k) => { if (search[side].q === q) n.textContent = `${k} hit(s) · p. ${p}/${of}`; });
  if (!res || search[side].q !== q) return;
  search[side].hits = res.hits; search[side].cur = -1;
  if (res.textless) { n.textContent = 'no text layer — an image-only scan, nothing to search'; pane.clearHits(); return; }
  n.textContent = res.hits.length ? `${res.hits.length} hit(s)` : 'no hits';
  pane.setHits(res.hits, -1);
  if (res.hits.length) walkHits(side, 1);
}
function walkHits(side, dir) {
  const s = search[side], pane = paneOf(side), n = searchRow(side).querySelector('.cr-searchn');
  if (!s.hits.length) return;
  s.cur = (s.cur + dir + s.hits.length) % s.hits.length;
  pane.gotoHit(s.cur);
  n.textContent = `${s.cur + 1} / ${s.hits.length}`;
}

function onClick(ev) {
  const act = ev.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'prev') return step(-1);
    if (a === 'next') return step(1);
    if (a === 'search') return toggleSearch(act.dataset.pane);
    if (a === 'searchclose') return toggleSearch(act.dataset.pane, false);
    if (a === 'hitprev') return walkHits(act.dataset.pane, -1);
    if (a === 'hitnext') return walkHits(act.dataset.pane, 1);
    if (a === 'gapto') {
      const pg = pdfPageFor(+act.dataset.page, st.left.doc && st.left.doc.offset, st.left.doc && st.left.doc.pagemap);
      if (pg) st.left.pane.focus(pg, 0); else setStatus(`stamped page ${act.dataset.page}: the registry maps no PDF page for it`);
      return;
    }
    if (a === 'tab') { ev.stopPropagation(); return activateTab(act.dataset.tab); }
    if (a === 'toright') { ev.stopPropagation(); return openRight(act.dataset.id, { page: 1 }).then(() => says(`${esc(act.dataset.id)} opened at page 1 from the list.`, 'ok')); }
    // the tree: a chevron folds one parent, a group heading folds its group, ⊟ closes everything, ◂ folds the nav to a rail
    if (a === 'fold') { ev.stopPropagation(); return toggleFold(act.dataset.id); }
    if (a === 'group') return toggleGroup(act.dataset.group);
    if (a === 'collapseall') return collapseAll();
    if (a === 'navrail') { ev.stopPropagation(); const h = $('#crNavSplit'); if (h && h.dataset.dragged) { delete h.dataset.dragged; return; } return toggleRail(); }   // a press that dragged the border is not a click
    if (a === 'showhidden') return toggleShowHidden();
    if (a === 'boxes') return toggleBoxes();
    // the footer and the corner (the owner's word 2026-09-30 ~04:5x CDT)
    if (a === 'more') return openMore(act.dataset.pane, ev, act);
    if (a === 'problems') return toggleProblems();
    if (a === 'notesdispatch') return notesDispatch(act.dataset.pane);
    if (a === 'notesclose') return notesSetOpen(act.dataset.pane, false);
    if (a === 'cite') {
      const u = st.left.units && st.left.units.byKey.get(act.dataset.key);
      const tg = ev.target.closest('.cr-tgt');
      if (u) return openFrom('left', u, tg ? +tg.dataset.k : 1, { step: true });
      return;
    }
  }
  const row = ev.target.closest('.cr-row');
  if (row) {
    if (row.dataset.series) return toggleFold(row.dataset.id);   // a series folder folds; it is not a document
    if (ev.altKey) return openRight(row.dataset.id, { page: 1 });
    return openLeft(row.dataset.id);
  }
}
function onKey(ev) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'f') {
    // ⌘F inside the window searches the pane the pointer last used (left by default)
    const side = ev.target.closest('#crRight') ? 'right' : 'left';
    ev.preventDefault(); toggleSearch(side, true); return;
  }
  if (ev.target.closest('input, textarea')) return;
  if (ev.key === 'h' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); toggleBoxes(); return; }   // the owner's button, on a key
  if (!ev.altKey && !ev.metaKey && !ev.ctrlKey && navKey(ev)) { ev.preventDefault(); return; }
  if (ev.altKey && !ev.metaKey && !ev.ctrlKey && /^Digit[1-5]$/.test(ev.code) && st.tabs.bar) {   // ⌥1–⌥5: the tabs in bar order
    const v = st.tabs.bar.tabs[+ev.code.slice(5) - 1]; if (v) { ev.preventDefault(); activateTab(v.id); } return;
  }
  if (ev.key === 'ArrowRight' && ev.altKey) { ev.preventDefault(); step(1); }
  else if (ev.key === 'ArrowLeft' && ev.altKey) { ev.preventDefault(); step(-1); }
  else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('cr-row')) { ev.preventDefault(); if (ev.target.dataset.series) toggleFold(ev.target.dataset.id); else openLeft(ev.target.dataset.id); }
}

function bindSplitters(root) {
  const body = $('#crBody');
  // A press on the collapse TAB is a drag only once it travels past a dead zone (the file explorer's rule, filing/splits.js:
  // "the tab is to help you find it and should still allow you to click and adjust the border"); a still click stays a click.
  const DEAD_ZONE = 3;
  const drag = (handle, onMove) => {
    handle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      handle.classList.add('is-dragging');
      const startX = ev.clientX; let dragged = false; delete handle.dataset.dragged;
      const move = (e) => { if (!dragged) { if (Math.abs(e.clientX - startX) <= DEAD_ZONE) return; dragged = true; handle.dataset.dragged = '1'; } onMove(e); };
      const up = () => { handle.classList.remove('is-dragging'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  };
  drag($('#crSplit'), (e) => {
    const left = $('#crLeft').getBoundingClientRect();
    const right = $('#crRight').getBoundingClientRect();
    const total = right.right - left.left;
    const pct = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((e.clientX - left.left) / total) * 100));
    st.split = pct; body.style.setProperty('--cr-split', `${pct}%`);
    try { localStorage.setItem(SPLIT_KEY, String(Math.round(pct))); } catch {}
  });
  // THE SIDEBAR COLLAPSES ALL THE WAY (owner 2026-09-30 03:56 CDT, the file explorer's behaviour): drag the border in past
  // NAV_COLLAPSE_AT and the list snaps to nothing (the rail state — the ▸ tab stays to bring it back); drag back out and it
  // re-opens at the pointer; the width is capped by what must remain for the two panes, not by a fixed number.
  drag($('#crNavSplit'), (e) => {
    const r = body.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < NAV_COLLAPSE_AT) { if (!st.nav.rail) { st.nav.rail = true; saveTree(); applyRail(); } return; }
    if (st.nav.rail) { st.nav.rail = false; saveTree(); }
    const w = Math.max(180, Math.min(Math.max(180, r.width - 360), px));
    st.navW = w; applyRail();
    try { localStorage.setItem(NAV_KEY, String(Math.round(w))); } catch {}
  });
  $('#crNavSplit').addEventListener('dblclick', (e) => { if (e.target.closest('.cr-navcollapse')) return; st.navW = 260; st.nav.rail = false; saveTree(); applyRail(); try { localStorage.setItem(NAV_KEY, '260'); } catch {} });
}

// exported for the harness
export const _state = st;
export { foldText };
