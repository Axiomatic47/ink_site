import Link from 'next/link';
import { cv } from '@/lib/cv';

// a 44-px tap target on phones and tablets (device run 2026-09-15): tall below lg, and 6 px of side
// padding so the short words (Legal, Terms) reach 44 wide; the row's gap shrinks by the same so the
// visual spacing is unchanged. From lg the desktop row keeps its height.
const footLink = 'inline-flex items-center min-h-11 lg:min-h-0 px-1.5 hover:text-white no-underline';

export function SiteFooter() {
  return (
    <footer className="bg-chrome text-on-chrome/80 no-print mt-16">
      <div className="mx-auto max-w-site px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:gap-3 text-sm">
        <span>
          © {new Date().getFullYear()} {cv.name}
        </span>
        <div className="flex flex-wrap gap-x-2 -mx-1.5 min-w-0">
          <a href={`mailto:${cv.email}`} className={footLink}>
            {cv.email}
          </a>
          {cv.links.map((l) => (
            <a key={l.url} href={l.url} rel="me noopener" className={footLink}>
              {l.label}
            </a>
          ))}
          <Link href="/contact" className={footLink}>Contact</Link>
          <Link href="/legal" className={footLink}>Legal</Link>
          <Link href="/terms" className={footLink}>Terms</Link>
          <Link href="/privacy" className={footLink}>Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
