'use client';
// app/kirchner-v-ellison/CaseReviewMount.tsx — the HOST of the Studio's Case Review window on kirchner.ink.
//
// The window is the Studio's own module, vendored byte for byte under public/casereview/vendor/ and run as a native
// ES module (never bundled: a rule change lands in the Studio and syncs out; scripts/sync-casereview.mjs). This
// component does what the Studio's shell does before the mount and nothing the window does itself: it marks the
// surface (the window writes its ?casereview= deep link only while document.body carries data-mode="casereview",
// the Studio's rule), names the CASE the window reads — `projroot=<slug>` in the page URL, which the window turns
// into `?root=<slug>` on its three fetches (casereview.js projRootQS) and the host's keyed rewrites answer with this
// case's bundle (scripts/import-casereview.mjs); the token is the case slug, never a path, and it is also the key of
// the window's per-case tree store — gives the page a default document when the URL names none (the newest filing
// with a link table — the one skin decision the Studio leaves to its host), and calls mountCaseReview() on
// #casereviewRoot. When the Studio's window takes a mount option for the root (frontend 2026-10-09), the option
// replaces the URL token here and the deep link keeps the Studio's exact form: ?casereview=doc=<id>&cite=<page>/<n>&q=…
import { useEffect } from 'react';

const WINDOW_URL = '/casereview/vendor/casereview.js';

type CaseReviewModule = { mountCaseReview: (opts?: { root?: string }) => void };

export function CaseReviewMount({ root, defaultDoc }: { root: string; defaultDoc: string | null }) {
  useEffect(() => {
    let cancelled = false;
    document.body.dataset.mode = 'casereview';
    const u = new URL(location.href);
    let moved = false;
    if (u.searchParams.get('projroot') !== root) { u.searchParams.set('projroot', root); moved = true; }
    // a URL without a state opens the default document through the window's own deep-link restore — no second path
    if (defaultDoc && !u.searchParams.has('casereview')) { u.searchParams.set('casereview', `doc=${defaultDoc}`); moved = true; }
    if (moved) { try { history.replaceState(null, '', u.toString()); } catch { /* the window then opens nothing, as the Studio does */ } }
    const url = `${location.origin}${WINDOW_URL}`;
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)
      .then((mod: CaseReviewModule) => { if (!cancelled) mod.mountCaseReview({ root }); })
      .catch((e: unknown) => {
        const el = document.getElementById('casereviewRoot');
        if (el) el.textContent = `The review window could not load — ${e instanceof Error ? e.message : String(e)}`;
      });
    return () => { cancelled = true; delete document.body.dataset.mode; };
  }, [root, defaultDoc]);
  return <div id="casereviewRoot" aria-label="Case review" />;
}
