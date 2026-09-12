'use client';
// Download CV — a small selector (owner 2026-09-11): the styled version, with
// the navy header band, or a print-friendly version with no shading. Both come
// from the one resume: the owner's Word exports under public/resume/ (current),
// or, when cv.json points at /cv/, files generated at build by build-cv-pdf.mjs.
// Either way scripts/check-pdf-private.mjs screens them before the build passes.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Printer } from 'lucide-react';

interface Props { styled: string; print?: string; className?: string }

export function DownloadCvMenu({ styled, print, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const button = 'inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent text-ink text-sm no-underline hover:bg-[#c29d63] transition-colors';
  if (!print) {
    return (
      <a href={styled} download className={`${button} ${className}`} style={{ fontWeight: 600 }}>
        <Download className="h-4 w-4" /> Download CV
      </a>
    );
  }
  const item = 'flex items-start gap-3 px-3 py-2.5 rounded-md text-ink no-underline hover:bg-well focus-visible:bg-well outline-none';
  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={button} style={{ fontWeight: 600 }}>
        <Download className="h-4 w-4" /> Download CV <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Download CV" className="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-rule bg-card p-1.5 shadow-card text-sm">
          <a role="menuitem" href={styled} download className={item} onClick={() => setOpen(false)}>
            <Download className="h-4 w-4 mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            <span><span className="block" style={{ fontWeight: 600 }}>Styled</span><span className="block text-muted">Navy header band, as shown in the viewer.</span></span>
          </a>
          <a role="menuitem" href={print} download className={item} onClick={() => setOpen(false)}>
            <Printer className="h-4 w-4 mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            <span><span className="block" style={{ fontWeight: 600 }}>Print-friendly</span><span className="block text-muted">No background shading. Same content.</span></span>
          </a>
        </div>
      )}
    </div>
  );
}
