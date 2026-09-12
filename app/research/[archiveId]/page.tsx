import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, FileText, ScrollText } from 'lucide-react';
import { cv } from '@/lib/cv';
import {ARCHIVE_IDS, RESEARCH_ARCHIVES, archiveBase, imagesPublished, leafStatus, CONVENTIONS } from '@/lib/research-archive';
import { readArchiveManifest } from '@/lib/research-archive.server';
import { SiteShell } from '../../_components/SiteShell';
import { Md } from '../../_components/Markdown';

export const dynamicParams = false;
export function generateStaticParams() {
  return ARCHIVE_IDS.map((archiveId) => ({ archiveId }));
}
type Params = { params: Promise<{ archiveId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { archiveId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  if (!c) return {};
  return { title: `${c.ref} — working transcription`, description: c.summary, alternates: { canonical: `/research/${archiveId}` } };
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-[0.14em] text-muted mb-3" style={{ fontWeight: 600 }}>{children}</div>
);
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-card border border-rule rounded-lg shadow-card p-6 ${className}`}>{children}</div>
);

export default async function ResearchArchivePage({ params }: Params) {
  const { archiveId } = await params;
  const c = RESEARCH_ARCHIVES[archiveId];
  if (!c) notFound();
  const manifest = readArchiveManifest(archiveId);

  return (
    <SiteShell>
      <Link href="/research" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink no-underline mb-6">← Research</Link>
      <div className="max-w-5xl">
        <Eyebrow>Primary-source research · working transcription</Eyebrow>
        <h1 className="font-serif tracking-tight leading-[1.12]" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 620 }}>
          {c.ref} — <Md inline>{c.caseTitle}</Md>
        </h1>
        <p className="text-sm text-muted mt-2">{c.source} · {c.dated}</p>

        <div className="mt-6 space-y-4 font-serif text-lg leading-relaxed text-ink/90 max-w-4xl">
          {c.intro.map((p, i) => <Md key={i}>{p}</Md>)}
          <p>
            <strong>Every reading here is provisional.</strong> These are working papers: uncertainty is marked rather than
            resolved, deltas between passes are logged, and unresolved readings are flagged for professional arbitration
            against the original. Corrections and collaboration are welcome — <a href={`mailto:${cv.email}`} className="underline text-accent-ink">{cv.email}</a>.
          </p>
        </div>

        {manifest && !imagesPublished(manifest) && (
          <div className="mt-8 bg-well border border-rule border-l-4 border-l-accent rounded-md px-5 py-4 text-sm leading-relaxed">
            <strong>Leaf images are not yet published.</strong> A reproduction licence from {manifest.images?.rightsHolder || 'the rights holder'} is pending.
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <Eyebrow>How to review</Eyebrow>
            <ol className="text-sm space-y-2 list-decimal ml-4 leading-relaxed">
              <li>Open a {c.leafLabel.toLowerCase()} below — the leaf image sits beside its documents (PDF).</li>
              <li>Compare the image against the <strong>transcript</strong> (continuous text with editorial notes) and the <strong>line index</strong> (line-by-line census).</li>
              <li>Readings marked <code className="font-mono bg-well px-1 rounded">[?]</code> are uncertain; <code className="font-mono bg-well px-1 rounded">⟦…⟧</code> notes record what later passes changed and why.</li>
              <li>The working papers below track every open question and delta across passes.</li>
            </ol>
          </Card>
          <Card>
            <Eyebrow>Diplomatic conventions</Eyebrow>
            <dl className="text-sm space-y-1.5">
              {CONVENTIONS.map(([sym, meaning]) => (
                <div key={sym} className="flex gap-3">
                  <dt className="w-24 shrink-0"><code className="font-mono text-accent-ink">{sym}</code></dt>
                  <dd className="text-muted">{meaning}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="mt-12">
          <Eyebrow>The {c.leafLabel.toLowerCase()}s{manifest ? ` — ${manifest.leaves.length} leaves` : ''}</Eyebrow>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {(manifest?.leaves || []).map((leaf) => (
              <Link key={leaf.id} href={`/research/${archiveId}/leaf/${leaf.id}`} className="group bg-card border border-rule rounded-lg shadow-card hover:border-accent transition-colors overflow-hidden flex flex-col no-underline">
                <div className="aspect-[3/4] bg-well overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
                  <img src={`${archiveBase(archiveId)}/${leaf.thumb ?? leaf.image}`} alt={`${c.leafLabel} ${leaf.id}`} loading="lazy" className="w-full h-full object-cover object-top group-hover:opacity-90 transition-opacity" />
                </div>
                <div className="p-3">
                  <div className="font-serif tabular-nums group-hover:text-accent-ink" style={{ fontWeight: 580 }}>{c.leafLabel} {leaf.id}</div>
                  <div className="text-[11px] text-muted mt-1 leading-snug">{leafStatus(leaf)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {manifest && manifest.workingPapers.length > 0 && (
          <div className="mt-12">
            <Eyebrow>Working papers</Eyebrow>
            <div className="bg-card border border-rule rounded-lg shadow-card p-2">
              {manifest.workingPapers.map((p) => (
                <Link key={p.pdf} href={`/research/${archiveId}/doc/${encodeURIComponent(p.pdf.replace(/^pdfs\//, ''))}`} className="group flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-well transition-colors no-underline">
                  <ScrollText className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                  <span className="text-sm leading-snug group-hover:text-accent-ink" style={{ fontWeight: 550 }}>{p.title}</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted mt-0.5 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 bg-well border border-rule border-l-4 border-l-accent rounded-md px-5 py-4">
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 text-accent mt-1 shrink-0" />
            <div className="text-sm text-ink/85 leading-relaxed">
              <strong>Provenance &amp; fixity.</strong> Source images: {c.source}.
              {imagesPublished(manifest) && manifest?.images?.rightsNote && <> {manifest.images.rightsNote}</>}
              {imagesPublished(manifest) && manifest?.images?.reuseNote && <> {manifest.images.reuseNote}</>}{' '}
              Each leaf&rsquo;s SHA-256 is recorded at publication and shown on its page, so any copy can be verified against the published hash.
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
