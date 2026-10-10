// src/lib/open-letter.ts — the shape of content/correspondence/mn-ag-candidates-open-letter.json (written by
// scripts/import-open-letter.mjs) and the small rules the page needs: a debate time → the recording at that second,
// a time → the transcript turn in progress, the clock forms the letter uses. No I/O here (the loader is
// open-letter.server.ts); everything in this file runs in the browser too.

export const OPEN_LETTER_SLUG = 'mn-ag-candidates-open-letter';
export const OPEN_LETTER_PATH = `/${OPEN_LETTER_SLUG}`;

export interface Turn {
  n: number;
  /** HH:MM:SS on the recording's own clock */
  time: string;
  /** the same, in seconds */
  t: number;
  /** MOD · KE · RS · KE/RS · KE/RS (crosstalk) — the key is `transcript.speakers` */
  speaker: string;
  text: string;
}

export interface OpenLetterContent {
  slug: string;
  generated: string;
  source: { tree: string; commit: string; files: { role: string; path: string; bytes: number; sha256: string; commit: string }[] };
  recording: { youtube_id: string; url: string; title: string | null; duration: string | null; duration_s: number | null; programme: string; date: string; moderator: string };
  letter: { title: string; header: string | null; date_line: string | null; markdown: string };
  enclosure: { title: string; header: string | null; markdown: string };
  transcript: { title: string; source: string; method: string; header_omitted: string[]; speakers: Record<string, string>; turns: Turn[] };
}

/** what the page's client body receives: the content a reader reads and nothing else — not the source tree's
    paths and commits, not the header clauses the import omitted (a client component's props are serialized
    into the page, so a field that is not rendered is still in the page's bytes) */
export interface OpenLetterView {
  generated: string;
  recording: OpenLetterContent['recording'];
  letter: OpenLetterContent['letter'];
  enclosure: OpenLetterContent['enclosure'];
  transcript: Omit<OpenLetterContent['transcript'], 'header_omitted'>;
}

export function toView(c: OpenLetterContent): OpenLetterView {
  const { title, source, method, speakers, turns } = c.transcript;
  return { generated: c.generated, recording: c.recording, letter: c.letter, enclosure: c.enclosure, transcript: { title, source, method, speakers, turns } };
}

/** the recording at a second: the letter's rule — every debate time is a link to this */
export function recordingUrl(youtubeId: string, t: number): string {
  return `https://www.youtube.com/watch?v=${youtubeId}&t=${Math.max(0, Math.floor(t))}s`;
}

/** "2:49" → 169 · "12:37" → 757 · "00:12:37" → 757 · anything else → null */
export function clockSeconds(s: string): number | null {
  const p = s.split(':');
  if (p.length < 2 || p.length > 3 || p.some((x) => !/^\d{1,2}$/.test(x))) return null;
  const n = p.map(Number);
  return p.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

/** seconds → the letter's form (M:SS, or H:MM:SS past the hour) */
export function clockLabel(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * A debate time as the letter and the enclosure write it — M:SS, MM:SS or H:MM:SS, optionally a range to a
 * second time ("22:07–23:26"; a range links to its start). The texts introduce most quotations with a colon
 * right after the time ("at 2:49: "Minnesota…"", "12:37–12:52: "They're…""), so a following colon is allowed
 * unless a digit follows it (then it is a longer clock, read whole from its start). Not a time: a digit before
 * or after, a "digit:" before (the tail of a longer clock), a minute or second part over 59, a docket prefix
 * ("0:26-cv-…").
 */
export const DEBATE_TIME_RE = /(?<!\d)(?<!\d:)(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s?[–—-]\s?(\d{1,2}:[0-5]\d(?::[0-5]\d)?))?(?!\d|:\d|-cv)/g;

/** the turn in progress at second t: the last turn that begins at or before it */
export function turnAt(turns: Turn[], t: number): Turn | undefined {
  let found: Turn | undefined;
  for (const x of turns) { if (x.t <= t) found = x; else break; }
  return found;
}

/** the `t=NNNs` of one of this recording's links, else null */
export function secondsFromRecordingUrl(href: string | undefined, youtubeId: string): number | null {
  if (!href) return null;
  const m = href.match(new RegExp(`[?&]v=${youtubeId}&t=(\\d+)s$`));
  return m ? Number(m[1]) : null;
}
