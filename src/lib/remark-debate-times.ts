// src/lib/remark-debate-times.ts — a remark plugin: every debate time in the letter's and the enclosure's prose
// ("at 2:49", "12:37–12:52", "16:14/16:24") becomes a link to the recording at that second (owner 2026-10-09:
// "hyperlinks to the timestamp in which statements were made"); a range links to its start. Text already inside a
// link or in code is left alone. The link's title says what it opens; the page's renderer reads the second back
// from the href (secondsFromRecordingUrl) to show the transcript turn beside the letter.
import type { Root, Parent, Text, Link, PhrasingContent } from 'mdast';
import { DEBATE_TIME_RE, clockSeconds, clockLabel, recordingUrl } from './open-letter';

const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'definition']);

function splitText(node: Text, youtubeId: string): PhrasingContent[] | null {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of node.value.matchAll(DEBATE_TIME_RE)) {
    const t = clockSeconds(m[1]);
    if (t == null) continue;
    const i = m.index ?? 0;
    if (i > last) out.push({ type: 'text', value: node.value.slice(last, i) });
    const link: Link = {
      type: 'link',
      url: recordingUrl(youtubeId, t),
      title: `The recording at ${clockLabel(t)}${m[2] ? ` (to ${m[2]})` : ''}`,
      children: [{ type: 'text', value: m[0] }],
    };
    out.push(link);
    last = i + m[0].length;
  }
  if (!out.length) return null;
  if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
  return out;
}

function walk(parent: Parent, youtubeId: string) {
  const next: typeof parent.children = [];
  for (const child of parent.children) {
    if (child.type === 'text') {
      const pieces = splitText(child as Text, youtubeId);
      if (pieces) next.push(...(pieces as typeof parent.children)); else next.push(child);
      continue;
    }
    if (!SKIP.has(child.type) && 'children' in child) walk(child as Parent, youtubeId);
    next.push(child);
  }
  parent.children = next;
}

/** remark plugin factory: `remarkPlugins={[[remarkDebateTimes, { youtubeId }]]}` */
export default function remarkDebateTimes(options: { youtubeId: string }) {
  return (tree: Root) => { walk(tree, options.youtubeId); };
}
