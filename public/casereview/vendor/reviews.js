// reviews.js — the site's SHIM for the deck's review composer the vendored window imports (ui/js/deck/reviews.js in
// the Studio). The window reaches openReview only from its notes drawer's "dispatch…" button, and the site draws no
// notes items (see ../filing/ctxmenu.js), so this is never called; it exists so the import resolves. Host code.
export function openReview() {
  console.warn('casereview: the review composer is the Studio\'s; nothing is dispatched from the site');
}
