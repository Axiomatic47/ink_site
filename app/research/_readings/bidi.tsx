// app/research/_readings/bidi.tsx — mixed-direction text for the Open
// Readings pages. Item texts interleave Hebrew with English glosses and
// editorial marks ("ויושע (kept)", "Do the traces after בו read והוא יודע?"),
// so a block is laid out LTR and every Hebrew run is isolated RTL in a <bdi>.
// Hebrew runs may contain spaces, maqaf/sof pasuq and the ◦ (unread letter)
// and ‖ (line break) marks the transcriber uses between Hebrew words.
import React from 'react';

const HEB = '\\u0590-\\u05FF\\uFB1D-\\uFB4F';
// a run = Hebrew letters, optionally continuing through spaces / marks into more Hebrew
const RUN = new RegExp(`[${HEB}]+(?:[\\s\\u05BE\\u05C3◦‖\\{\\}\\[\\]\\*]*[${HEB}]+)*`, 'g');

// system Hebrew-capable serif stack — this site loads no web fonts
export const HEBREW_FACE = '"Noto Serif Hebrew", "SBL Hebrew", "Times New Roman", "David", "Arial Hebrew", serif';

export function renderBidi(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(RUN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <bdi key={k++} dir="rtl" lang="he" style={{ fontFamily: HEBREW_FACE }}>
        {m[0]}
      </bdi>
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A reading (ours / comparison) set large; Hebrew-only readings sit RTL as a block. */
export function ReadingText({ text, size = 'lg' }: { text: string; size?: 'lg' | 'md' }) {
  const stripped = text.replace(RUN, '').replace(/[\s\p{P}\p{S}]/gu, '');
  const hebrewOnly = stripped.length === 0;
  return (
    <p
      className="font-serif text-ink m-0"
      dir={hebrewOnly ? 'rtl' : 'ltr'}
      lang={hebrewOnly ? 'he' : undefined}
      style={{
        fontSize: size === 'lg' ? 'clamp(22px, 2.6vw, 30px)' : '1.0625rem',
        lineHeight: 1.45,
        fontFamily: hebrewOnly ? HEBREW_FACE : undefined,
        textAlign: hebrewOnly ? 'right' : 'left',
        unicodeBidi: 'plaintext',
      }}
    >
      {hebrewOnly ? text : renderBidi(text)}
    </p>
  );
}
