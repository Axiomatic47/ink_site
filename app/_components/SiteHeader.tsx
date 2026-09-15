'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cv } from '@/lib/cv';
import { Monogram } from './Monogram';
import { ThemeToggle } from './ThemeToggle';
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
  `flex items-center justify-center gap-1 flex-1 sm:flex-none px-1 sm:px-5 text-[13px] sm:text-sm tracking-wide no-underline border-b-2 transition-colors ${on ? 'border-accent text-white' : 'border-transparent text-on-chrome/75 hover:text-white hover:bg-chrome-2'}`;

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
    <header className="bg-chrome text-on-chrome no-print relative z-40">
      {/* phones: monogram + theme toggle on the first row, the nav on a full-width second row (equal
          cells); from sm one 64-px row. The nav used to run 77 px past an iPhone's viewport (device run
          via frontend-developer a168bcf6, 2026-09-15). Every control is a 44-px target on touch screens. */}
      <div className="mx-auto max-w-site px-5 sm:px-8 flex flex-wrap items-center justify-between gap-x-6 sm:h-16">
        {/* JK monogram, linking home (owner 2026-09-14) */}
        <Link href="/" className="order-1 flex items-center justify-center h-14 sm:h-16 min-w-11 no-underline shrink-0" aria-label={`${cv.name} home`}>
          <Monogram className="text-on-chrome" />
        </Link>
        <nav aria-label="Primary" className="order-3 sm:order-2 w-full sm:w-auto flex items-stretch h-12 sm:h-16 -mx-1 sm:mx-0">
          <Link href="/" aria-current={path === '/' ? 'page' : undefined} className={itemClass(path === '/')}>About</Link>
          <Link href="/bio" aria-current={path.startsWith('/bio') ? 'page' : undefined} className={itemClass(path.startsWith('/bio'))}>Biography</Link>
          <Link href="/work" aria-current={path.startsWith('/work') ? 'page' : undefined} className={itemClass(path.startsWith('/work'))}>Articles</Link>
          <div ref={menuRef} className="relative flex items-stretch">
            <button type="button" onClick={() => setOpened(isOpen ? null : path)} aria-haspopup="menu" aria-expanded={isOpen} aria-current={onResearch ? 'page' : undefined} className={itemClass(onResearch)}>
              Research <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {isOpen && (
              <div role="menu" className="absolute right-0 sm:right-0 top-full mt-0 w-[min(16rem,calc(100vw-2.5rem))] sm:w-auto sm:min-w-[16rem] rounded-b-lg border border-t-0 border-rule bg-card text-ink shadow-card py-1">
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
        <ThemeToggle className="order-2 sm:order-3 sm:ml-2" />
      </div>
    </header>
  );
}
