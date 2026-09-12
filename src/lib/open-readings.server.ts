// src/lib/open-readings.server.ts — build-time loader for content/readings
// (<collection>.json + <collection>.answers.json + <collection>.meta.json).
// Rules enforced here: collation_ref is internal and stripped; status is
// DERIVED (open → answered → resolved), never stored; answers carry no contact.
import fs from 'node:fs';
import path from 'node:path';
import type { OpenReading, PublishedAnswer, ReadingLicence, ReadingStatus, ReadingWithState, ReadingsCollection } from './open-readings';

const ROOT = path.join(process.cwd(), 'content', 'readings');
const CROPS_PUBLIC = '/uploads/readings';

function readJson<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

export function listReadingCollections(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  // underscore-prefixed files are build products (_store-export.json), never collections
  return fs.readdirSync(ROOT).filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.endsWith('.answers.json') && !f.endsWith('.meta.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

interface RawFile { _generated?: unknown; items: (OpenReading & { collation_ref?: string })[] }
interface MetaFile { title?: string; description?: string; holder?: string; licence?: ReadingLicence }

export function loadReadingsCollection(id: string): ReadingsCollection | null {
  const raw = readJson<RawFile>(path.join(ROOT, `${id}.json`));
  if (!raw?.items) return null;
  const answers = readJson<{ answers: PublishedAnswer[] }>(path.join(ROOT, `${id}.answers.json`))?.answers ?? [];
  const meta = readJson<MetaFile>(path.join(ROOT, `${id}.meta.json`)) ?? {};
  const byItem = new Map<string, PublishedAnswer[]>();
  for (const a of answers) { if (!byItem.has(a.item_id)) byItem.set(a.item_id, []); byItem.get(a.item_id)!.push(a); }
  const items: ReadingWithState[] = raw.items.map((it) => {
    const { collation_ref: _internal, ...pub } = it; void _internal;
    const mine = (byItem.get(it.id) ?? []).slice().sort((a, b) => a.published.localeCompare(b.published));
    const status: ReadingStatus = it.resolution ? 'resolved' : mine.length ? 'answered' : 'open';
    const crop = it.licence?.republish === false ? null : `${CROPS_PUBLIC}/${id}/${it.id}.jpg`;
    return { ...pub, status, answers: mine, crop };
  });
  const first = items[0];
  return { id, title: meta.title ?? (first ? `${first.shelfmark} — open readings` : id), description: meta.description, holder: meta.holder ?? first?.source.holder, licence: meta.licence ?? first?.licence, items };
}

export function loadAllReadings(): ReadingsCollection[] {
  return listReadingCollections().map(loadReadingsCollection).filter((c): c is ReadingsCollection => !!c);
}

export function findReading(collection: string, id: string) {
  const c = loadReadingsCollection(collection);
  if (!c) return null;
  const index = c.items.findIndex((i) => i.id === id);
  if (index < 0) return null;
  return { collection: c, item: c.items[index], index };
}

export function loadAcknowledgements() {
  const out = new Map<string, { display: string; credentials_summary?: string; items: { collection: string; id: string; shelfmark: string }[] }>();
  for (const c of loadAllReadings()) for (const it of c.items) for (const a of it.answers) {
    if (!a.ack || a.reader.display.toLowerCase() === 'anonymous reader') continue;
    const key = `${a.reader.display}|${a.reader.credentials_summary ?? ''}`;
    if (!out.has(key)) out.set(key, { display: a.reader.display, credentials_summary: a.reader.credentials_summary, items: [] });
    out.get(key)!.items.push({ collection: c.id, id: it.id, shelfmark: it.shelfmark });
  }
  return [...out.values()].sort((a, b) => a.display.localeCompare(b.display));
}
