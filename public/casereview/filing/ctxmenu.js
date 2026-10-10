// ctxmenu.js — the site's SHIM for the deck's shared menu the vendored window imports (ui/js/filing/ctxmenu.js in
// the Studio): showCtx(x, y, items) / hideCtx(). Items: {label, run, disabled?} · {label, children: [items]} (one
// flyout level) · {sep: true} · null skipped — the same shapes, drawn as a plain menu in the site's skin (.fctx).
// Dismissed by a click anywhere, by Escape, by a second showCtx. Host code, not vendored.
//
// What the site leaves out: the items that open the Studio's NOTES drawer ("notes for ECF 74…"). The notes ride the
// Studio's own store (/api/notes, one file per document under the project) and the deck's review composer, which the
// site does not have — the item would open a drawer that cannot load. Everything else the window puts in its ⋯ menu
// (the document's name and status line, the highlights, open in the other pane, the problems, the citations on this
// page) is drawn as the window hands it.
let _menu = null;
let _sub = null;
let _shownThisEvent = false;

function hideSub() { if (_sub) { _sub.remove(); _sub = null; } }
export function hideCtx() { hideSub(); if (_menu) { _menu.remove(); _menu = null; } }

const NOTES_ITEM = /^notes(?: for .*)?…$/;

function place(el, x, y) {
  el.style.left = '0px'; el.style.top = '0px';
  const r = el.getBoundingClientRect();
  const w = window.innerWidth, h = window.innerHeight;
  let left = x, top = y;
  if (left + r.width > w - 6) left = Math.max(6, w - r.width - 6);
  if (top + r.height > h - 6) top = Math.max(6, y - r.height - 4);   // from a footer: lift the menu above the pointer
  el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
}

function buildMenu(items, isSub = false) {
  const m = document.createElement('div');
  m.className = isSub ? 'fctx fctx-sub' : 'fctx';
  m.setAttribute('role', 'menu');
  for (const it of items || []) {
    if (!it) continue;
    if (it.sep) { const s = document.createElement('div'); s.className = 'fctx-sep'; m.appendChild(s); continue; }
    if (typeof it.label === 'string' && NOTES_ITEM.test(it.label)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fctx-item';
    b.setAttribute('role', 'menuitem');
    b.textContent = it.label ?? '';
    if (it.children) {
      b.classList.add('has-sub');
      b.addEventListener('mouseenter', () => {
        hideSub();
        _sub = buildMenu(it.children, true);
        document.body.appendChild(_sub);
        const r = b.getBoundingClientRect();
        place(_sub, r.right - 2, r.top - 4);
      });
    } else if (it.disabled) {
      b.disabled = true;
    } else {
      b.addEventListener('click', (e) => { e.stopPropagation(); hideCtx(); if (typeof it.run === 'function') it.run(); });
    }
    m.appendChild(b);
  }
  m.addEventListener('contextmenu', (e) => e.preventDefault());
  return m;
}

export function showCtx(x, y, items) {
  hideCtx();
  // the document-level dismiss below runs in the bubble phase of the SAME click that opened the menu; the flag keeps
  // it from closing what it just opened (the deck's rule: a timeout, never a microtask)
  _shownThisEvent = true;
  setTimeout(() => { _shownThisEvent = false; }, 0);
  _menu = buildMenu(items);
  document.body.appendChild(_menu);
  place(_menu, x, y);
  const first = _menu.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

document.addEventListener('click', () => { if (_shownThisEvent) { _shownThisEvent = false; return; } hideCtx(); });
document.addEventListener('keydown', (e) => {
  if (!_menu) return;
  if (e.key === 'Escape') { e.preventDefault(); hideCtx(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const all = [..._menu.querySelectorAll('button:not([disabled])')];
    const i = all.indexOf(document.activeElement);
    const next = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); }
  }
});
window.addEventListener('blur', hideCtx);
