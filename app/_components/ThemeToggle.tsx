// ThemeToggle — light / dark / system, as lawsofexistence.com has (owner
// 2026-09-15). One button cycles the three; the choice is remembered in
// localStorage `jk-theme` and applied before first paint by the inline script
// in app/layout.tsx, so there is no flash. No dependency: the class on <html>
// is the whole mechanism (tailwind darkMode: 'class').
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_KEY = 'jk-theme';
const ORDER: ThemeChoice[] = ['light', 'dark', 'system'];

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    // read after hydration (the inline script already applied the class)
    const t = setTimeout(() => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(THEME_KEY); } catch { /* storage unavailable */ }
      setChoice(stored === 'dark' || stored === 'light' ? stored : 'system');
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);

  const next = () => {
    const c = ORDER[(ORDER.indexOf(choice ?? 'system') + 1) % ORDER.length];
    setChoice(c);
    try { if (c === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, c); } catch { /* ignore */ }
    applyTheme(c);
  };

  // before hydration the button keeps its box but shows nothing, so the header does not jump
  if (!choice) return <span className={cn('inline-block h-9 w-9', className)} aria-hidden />;
  const Icon = choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor;
  const label = choice === 'dark' ? 'Dark' : choice === 'light' ? 'Light' : 'System';
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${label} — click for ${ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]}`}
      aria-label={`Theme: ${label}. Switch theme`}
      className={cn('h-9 w-9 inline-flex items-center justify-center rounded-md text-on-chrome/80 hover:text-white hover:bg-chrome-2 transition-colors', className)}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
