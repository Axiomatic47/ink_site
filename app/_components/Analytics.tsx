// Analytics — the page-view beacon (first-party counter, owner 2026-09-16). One
// POST to this site's own /api/hit per page shown: the path, the referring site
// (first load only), the viewport width. No cookie, no identifier, nothing read
// back. Not sent at all when the browser asks not to be tracked (Global Privacy
// Control), when counting was turned off on the Privacy page, on the dev server,
// or under /admin. The edge function behind /api/hit does the rest
// (netlify/lib/analytics-hit.mjs) and never answers with anything.
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export const ANALYTICS_KEY = 'jk-analytics';

/** the visitor turned counting off in this browser (Privacy page) */
export function analyticsOff(): boolean {
  try { return localStorage.getItem(ANALYTICS_KEY) === 'off'; } catch { return false; }
}
/** the browser sends Global Privacy Control */
export function gpcOn(): boolean {
  return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}

function send(body: string) {
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/hit', new Blob([body], { type: 'text/plain' }))) return;
  } catch { /* fall through to fetch */ }
  fetch('/api/hit', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => { /* fire and forget */ });
}

export function Analytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    const first = last.current === null;
    last.current = pathname;
    if (pathname.startsWith('/admin')) return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    if (gpcOn() || analyticsOff()) return;
    // after the first paint, never on the page's critical path; the referrer is
    // meaningful on the first load only (afterwards it is this site)
    const body = JSON.stringify({ p: pathname, r: first ? document.referrer || '' : '', w: window.innerWidth });
    const t = setTimeout(() => send(body), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
