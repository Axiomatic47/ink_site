'use client';
// app/kirchner-v-ellison/CaseReviewMount.tsx — the HOST of the Studio's Case Review window on kirchner.ink.
//
// The window is the Studio's own module, vendored byte for byte under public/casereview/vendor/ and run as a native
// ES module (never bundled: a rule change lands in the Studio and syncs out; scripts/sync-casereview.mjs). This
// component does what the Studio's shell does before the mount and nothing the window does itself: it marks the
// surface (the window writes its ?casereview= deep link only while document.body carries data-mode="casereview",
// the Studio's rule), names the CASE the window reads through the mount option — `mountCaseReview({ root })`, the
// Studio's P97v: the window carries `?root=<slug>` on its three fetches and the host's keyed rewrites answer with this
// case's bundle (scripts/import-casereview.mjs); the token is the case slug, never a path, and it is also the key of
// the window's per-case tree store; the page URL carries no token, so the deep link keeps the Studio's exact form,
// ?casereview=doc=<id>&cite=<page>/<n>&q=… — gives the page a default document when the URL names none (the one skin
// decision the Studio leaves to its host; src/lib/case-review.server.ts), and calls the mount on #casereviewRoot.
// R3 (the one skin, 2026-10-21; the owner's § 6): the window draws its own head row — the way back, the caption, the docket
// line, the mode, the registry stamp — from the words the host hands it in the mount option `head`. The host's own header
// is gone; the host supplies a TOKEN SHEET (./casereview.css) and links the window's vendored stylesheet.
import { useEffect } from 'react';

const WINDOW_URL = '/casereview/vendor/casereview.js';

/** the head row's words, as the window's core headWords() reads them: caption required */
export type CaseReviewHead = { caption: string; line?: string | null; mode?: string | null; version?: string | null; back?: { href: string; label: string } | null };

type CaseReviewModule = { mountCaseReview: (opts?: { root?: string; head?: CaseReviewHead | null }) => void };

export function CaseReviewMount({ root, defaultDoc, head = null }: { root: string; defaultDoc: string | null; head?: CaseReviewHead | null }) {
  useEffect(() => {
    let cancelled = false;
    document.body.dataset.mode = 'casereview';
    // a URL without a state opens the default document through the window's own deep-link restore — no second path
    if (defaultDoc) {
      const u = new URL(location.href);
      if (!u.searchParams.has('casereview')) {
        u.searchParams.set('casereview', `doc=${defaultDoc}`);
        try { history.replaceState(null, '', u.toString()); } catch { /* the window then opens nothing, as the Studio does */ }
      }
    }
    const url = `${location.origin}${WINDOW_URL}`;
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)
      .then((mod: CaseReviewModule) => { if (!cancelled) mod.mountCaseReview({ root, head }); })
      .catch((e: unknown) => {
        const el = document.getElementById('casereviewRoot');
        if (el) el.textContent = `The review window could not load — ${e instanceof Error ? e.message : String(e)}`;
      });
    return () => { cancelled = true; delete document.body.dataset.mode; };
  }, [root, defaultDoc, head]);
  return <div id="casereviewRoot" aria-label="Case review" />;
}
