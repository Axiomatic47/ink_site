'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cv } from '@/lib/cv';
import { RESEARCH_ARCHIVES, ARCHIVE_IDS } from '@/lib/research-archive';

// Research is a menu (like the other site's header): the archives, Open
// Readings, and Acknowledgements. Everything else is a plain link.
const RESEARCH_MENU = [
  { href: '/research', label: 'All research' },
  ...ARCHIVE_IDS.map((id) => ({ href: `/research/${id}`, label: RESEARCH_ARCHIVES[id].ref })),
  { href: '/research/open-readings', label: 'Open Readings' },
  { href: '/research/acknowledgements', label: 'Acknowledgements' },
];

const itemClass = (on: boolean) =>
  `flex items-center gap-1 px-4 sm:px-5 text-sm tracking-wide no-underline border-b-2 transition-colors ${on ? 'border-accent text-white' : 'border-transparent text-on-ink/75 hover:text-white hover:bg-ink-2'}`;

export function SiteHeader() {
  const path = usePathname() ?? '/';
  // the menu is open only on the path it was opened on — navigating closes it
  // without an effect
  const [opened, setOpened] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = opened === path;
  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpened(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpened(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [isOpen]);

  const onResearch = path.startsWith('/research');
  return (
    <header className="bg-ink text-on-ink no-print relative z-40">
      <div className="mx-auto max-w-site px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="font-serif text-xl tracking-tight no-underline" style={{ fontWeight: 560 }}>
          {cv.name.split(' ').slice(-1)[0]}<span className="text-accent">.</span>ink
        </Link>
        <nav aria-label="Primary" className="flex items-stretch h-full">
          <Link href="/" aria-current={path === '/' ? 'page' : undefined} className={itemClass(path === '/')}>About</Link>
          <Link href="/work" aria-current={path.startsWith('/work') ? 'page' : undefined} className={itemClass(path.startsWith('/work'))}>Articles</Link>
          <div ref={menuRef} className="relative flex items-stretch">
            <button type="button" onClick={() => setOpened(isOpen ? null : path)} aria-haspopup="menu" aria-expanded={isOpen} aria-current={onResearch ? 'page' : undefined} className={itemClass(onResearch)}>
              Research <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {isOpen && (
              <div role="menu" className="absolute right-0 top-full mt-0 min-w-[16rem] rounded-b-lg border border-t-0 border-rule bg-card text-ink shadow-card py-1">
                {RESEARCH_MENU.map((m, i) => (
                  <Link key={m.href} role="menuitem" href={m.href} className={`block px-4 py-2.5 text-sm no-underline hover:bg-well ${path === m.href ? 'text-accent-ink' : ''} ${i === 1 ? 'border-t border-rule mt-1 pt-3' : ''} ${m.href === '/research/open-readings' ? 'border-t border-rule mt-1 pt-3' : ''}`} style={m.href === '/research/open-readings' ? { fontWeight: 600 } : undefined}>
                    {m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/contact" aria-current={path.startsWith('/contact') ? 'page' : undefined} className={itemClass(path.startsWith('/contact'))}>Contact</Link>
        </nav>
      </div>
    </header>
  );
}
