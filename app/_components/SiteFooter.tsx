import Link from 'next/link';
import { cv } from '@/lib/cv';

export function SiteFooter() {
  return (
    <footer className="bg-ink text-on-ink/80 no-print mt-16">
      <div className="mx-auto max-w-site px-5 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          © {new Date().getFullYear()} {cv.name}
        </span>
        <div className="flex gap-5">
          <a href={`mailto:${cv.email}`} className="hover:text-white no-underline">
            {cv.email}
          </a>
          {cv.links.map((l) => (
            <a key={l.url} href={l.url} rel="me noopener" className="hover:text-white no-underline">
              {l.label}
            </a>
          ))}
          <Link href="/contact" className="hover:text-white no-underline">Contact</Link>
          <Link href="/legal" className="hover:text-white no-underline">Legal</Link>
          <Link href="/terms" className="hover:text-white no-underline">Terms</Link>
          <Link href="/privacy" className="hover:text-white no-underline">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
