// AnalyticsOptOut — the Privacy page's switch for the first-party counter: one
// button, remembered in this browser only (localStorage `jk-analytics` = off).
// A browser sending Global Privacy Control is already uncounted; the switch says so.
'use client';

import { useEffect, useState } from 'react';
import { ANALYTICS_KEY, analyticsOff, gpcOn } from './Analytics';

export function AnalyticsOptOut() {
  const [state, setState] = useState<'on' | 'off' | 'gpc' | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setState(gpcOn() ? 'gpc' : analyticsOff() ? 'off' : 'on'), 0);
    return () => clearTimeout(t);
  }, []);
  const toggle = () => {
    const next = state === 'off' ? 'on' : 'off';
    try { if (next === 'off') localStorage.setItem(ANALYTICS_KEY, 'off'); else localStorage.removeItem(ANALYTICS_KEY); } catch { /* storage unavailable */ }
    setState(next);
  };
  const button = 'inline-flex items-center rounded-md border border-rule px-3 py-1.5 text-sm text-ink hover:bg-ink/5 no-underline';
  if (state === null) return <p className="text-sm text-muted">Checking this browser&rsquo;s setting…</p>;
  if (state === 'gpc') return <p className="text-sm text-muted">This browser sends the Global Privacy Control signal, so its visits are not counted. Nothing to turn off.</p>;
  return (
    <p className="text-sm text-muted flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>Counting in this browser is <strong className="text-ink">{state === 'on' ? 'on' : 'off'}</strong>.</span>
      <button type="button" onClick={toggle} className={button} aria-pressed={state === 'off'}>
        {state === 'on' ? 'Turn counting off in this browser' : 'Turn counting back on'}
      </button>
    </p>
  );
}
