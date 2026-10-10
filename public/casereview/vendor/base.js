// base.js — the site's SHIM for the deck helpers the vendored window imports (ui/js/deck/base.js in the Studio):
// `$` and `esc`, the same semantics. Host code, not vendored; nothing else of the deck's base module is needed here.
export const $ = (sel, root = document) => root.querySelector(sel);
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
