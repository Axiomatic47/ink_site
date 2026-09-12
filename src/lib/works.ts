// src/lib/works.ts — typed loader for content/works.json.
import raw from '../../content/works.json';

export interface Work {
  slug: string;
  title: string;
  subtitle?: string;
  year?: string;
  venue?: string;
  blurb?: string;
  pdf: string;      // site-relative, under public/works/
  source?: string;  // where the piece was first published
}

export const works: Work[] = (raw as { works: Work[] }).works;
export const workBySlug = (slug: string): Work | undefined => works.find((w) => w.slug === slug);
