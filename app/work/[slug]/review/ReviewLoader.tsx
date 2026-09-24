// ReviewLoader — fetches the review manifest (a hashed, immutable JSON under
// /review/) and hands it to ReviewBody. Until it arrives the body renders with
// a stub carrying only the book PDF, so the book pane starts loading at once
// and the citation boxes appear when the manifest lands (owner 2026-09-15:
// the page had shipped the 2 MB manifest and the whole rendered text inline).
'use client';

import { useEffect, useState } from 'react';
import { stubManifest, type BookVersion, type EditionMap, type ReviewManifest, type ReviewMeta } from '@/lib/review';
import { ReviewBody } from './ReviewBody';

interface Props {
  work: { slug: string; title: string; subtitle?: string; venue?: string };
  meta: ReviewMeta;
  textHref?: string;
  backHref?: string;
  backLabel?: string;
  /** the archive leaves that serve an edition (a held page whose chip links to one opens it in the pane) */
  editions?: EditionMap;
  /** the book's version log, newest first (the footer's version drop-down, owner 2026-09-24) */
  versions?: BookVersion[];
  children?: React.ReactNode;
}

export function ReviewLoader({ meta, ...rest }: Props) {
  const [manifest, setManifest] = useState<ReviewManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(meta.publicUrl, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`${res.status}`);
        const m = (await res.json()) as ReviewManifest;
        if (!cancelled) setManifest(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [meta.publicUrl]);
  return <ReviewBody {...rest} manifest={manifest ?? stubManifest(meta)} published={meta.published} loading={!manifest && !error} loadError={error} sourceCount={meta.sourceCount} />;
}
