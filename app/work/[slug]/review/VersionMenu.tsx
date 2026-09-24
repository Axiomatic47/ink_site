// VersionMenu — the book's VERSION drop-down (owner 2026-09-24: "a versioning drop down at the footer of
// the article page … concise notes of change"): a button naming the current version opens a list of every
// uploaded version with its date, the sha prefixes of its text and PDF, and a concise note of what changed.
// The list is a popover laid OVER the page (absolute; opens upward from the review page's footer), so it
// never enters the panes' height budget. Ported from lawsofexistence.com (loe d6354bd, 55339aa7).
'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BookVersion } from '@/lib/review';

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function VersionMenu({ versions, align = 'right', up = true, className }: { versions: BookVersion[]; align?: 'left' | 'right'; up?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!versions.length) return null;
  const current = versions[0];
  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} aria-haspopup="listbox"
        className="inline-flex items-center gap-1 rounded-md border border-rule bg-card px-2 h-6 text-[11px] text-ink/85 hover:bg-well transition-colors tabular-nums"
        style={{ fontWeight: 550 }} title="Versions of this book — what changed at each upload">
        <History className="h-3 w-3 text-accent-ink" aria-hidden />
        Version {current.version} · {shortDate(current.date)}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Versions"
          className={cn('absolute z-40 w-[26rem] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-md border border-rule bg-card shadow-card p-1 text-left',
            up ? 'bottom-full mb-1' : 'top-full mt-1', align === 'right' ? 'right-0' : 'left-0')}>
          {versions.map((v, i) => (
            <div key={v.version} role="option" aria-selected={i === 0} className={cn('rounded px-3 py-2', i === 0 && 'bg-accent/15')}>
              <p className="text-xs text-ink tabular-nums" style={{ fontWeight: 600 }}>
                Version {v.version}{i === 0 ? ' — current' : ''}
                <span className="text-muted" style={{ fontWeight: 500 }}> · {shortDate(v.date)}</span>
              </p>
              <p className="text-xs text-ink/85 leading-relaxed mt-0.5">{v.note}</p>
              {(v.text || v.pdf) && (
                <p className="text-[10px] text-muted font-mono mt-1">{v.text ? `text ${v.text}` : ''}{v.text && v.pdf ? ' · ' : ''}{v.pdf ? `pdf ${v.pdf}` : ''}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
