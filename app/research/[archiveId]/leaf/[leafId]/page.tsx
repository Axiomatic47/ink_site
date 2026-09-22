import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {ARCHIVE_IDS, RESEARCH_ARCHIVES } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { ogImages } from '@/lib/og.server';
import { LeafBody } from './LeafBody';
import { loadAllReadings } from '@/lib/open-readings.server';

export const dynamicParams = false;
export function generateStaticParams() {
  const out: Array<{ archiveId: string; leafId: string }> = [];
  for (const archiveId of ARCHIVE_IDS) for (const leaf of readArchiveManifest(archiveId)?.leaves ?? []) out.push({ archiveId, leafId: leaf.id });
  return out;
}
type Params = { params: Promise<{ archiveId: string; leafId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { archiveId, leafId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  if (!c) return {};
  const title = `${c.leafLabel} ${leafId} — ${c.ref}`;
  const description = c.edition
    ? `The ${c.leafLabel.toLowerCase()} image beside its transcription (PDF) — the professional verification transcription by ${c.edition.author}.`
    : `The ${c.leafLabel.toLowerCase()} image; the transcription follows.`;
  // the social card is this leaf (scripts/build_og_images.py; owner 2026-09-21)
  const og = ogImages(`research-${archiveId}-${leafId}`, `${c.ref}, ${c.leafLabel.toLowerCase()} ${leafId}`);
  return {
    title, description, alternates: { canonical: `/research/${archiveId}/leaf/${leafId}` },
    openGraph: { title, description, type: 'article', url: `/research/${archiveId}/leaf/${leafId}`, ...og.openGraph },
    twitter: og.twitter,
  };
}

export default async function ResearchLeafPage({ params }: Params) {
  const { archiveId, leafId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  const manifest = readArchiveManifest(archiveId);
  const leaf = manifest?.leaves.find((l) => l.id === leafId);
  if (!c || !manifest || !leaf) notFound();
  const ids = manifest.leaves.map((l) => l.id);
  const idx = ids.indexOf(leafId);
  const openReadings = loadAllReadings().flatMap((col) => col.items.filter((it) => it.source.kind === 'archive' && it.source.archiveId === archiveId && it.source.leafId === leafId).map((it) => ({ collection: col.id, id: it.id })));
  return (
    <LeafBody archiveId={archiveId} refLabel={c.ref} leafLabel={c.leafLabel} manifest={manifest} leaf={leaf} openReadings={openReadings}
      prev={idx > 0 ? ids[idx - 1] : null} next={idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null} />
  );
}
