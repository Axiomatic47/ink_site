// src/lib/immunity-timeline.server.ts — build-time loader for /research/immunity-timeline. The one file is
// public/research/immunity-timeline.json (served as the copy a reader can take). Absent → null, and the page answers
// 404: the route exists only when the reviewed content does. IMMUNITY_TIMELINE_JSON points the loader at another file
// for a local build against a draft; it is ignored under CI/NETLIFY, where only the committed file counts.
import fs from 'node:fs';
import path from 'node:path';
import type { ImmunityTimeline } from './immunity-timeline';
import { sortEntries } from './immunity-timeline';

const FILE = path.join(process.cwd(), 'public', 'research', 'immunity-timeline.json');

export function timelinePath(): string {
  const override = process.env.IMMUNITY_TIMELINE_JSON;
  if (override && !process.env.NETLIFY && !process.env.CI) return path.resolve(override);
  return FILE;
}

export function hasImmunityTimeline(): boolean {
  return fs.existsSync(timelinePath());
}

export function loadImmunityTimeline(): ImmunityTimeline | null {
  const p = timelinePath();
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as ImmunityTimeline;
  return { ...raw, entries: sortEntries(raw.entries ?? []) };
}
