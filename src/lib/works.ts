// src/lib/works.ts — typed loader for content/works.json: the Articles library.
// Imported from lawsofexistence.com's research collections by
// scripts/import-loe-articles.mjs (owner 2026-09-12). Pure JSON here so client
// components may import it; the article TEXT is read by works.server.ts.
import raw from '../../content/works.json';

export interface Collection {
  slug: string;
  title: string;
  date?: string;      // YYYY-MM-DD
  featured?: boolean;
}
export interface Work {
  slug: string;
  collection: string; // Collection.slug
  title: string;
  subtitle?: string;
  date?: string;      // YYYY-MM-DD
  year?: string;
  venue?: string;
  blurb?: string;
  pdf?: string;       // site-relative, under public/works/ — the article as a PDF
  body?: string;      // repo path of the article's markdown text (content/works/<slug>.md)
  local?: boolean;    // published from the owner's manuscript tree by scripts/import-local-works.mjs (survives the LOE import)
  featured?: boolean;
  source?: string;    // where the piece was first published
}

const data = raw as { collections: Collection[]; works: Work[] };
export const collections: Collection[] = data.collections;
export const works: Work[] = data.works;
export const workBySlug = (slug: string): Work | undefined => works.find((w) => w.slug === slug);
export const collectionBySlug = (slug: string): Collection | undefined => collections.find((c) => c.slug === slug);
export const worksIn = (collection: string): Work[] => works.filter((w) => w.collection === collection);
