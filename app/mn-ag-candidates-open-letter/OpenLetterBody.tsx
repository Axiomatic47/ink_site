// OpenLetterBody — the open letter beside the debate it quotes, in the review-mode pattern of the book pages
// (ReviewBody: h-11 header bars, h-8 sub-bars, matched cards, a mode toggle, the record line under the panes).
// LEFT, the document: the owner's own PDF of the letter, or of Enclosure A, with every debate time a hit box over
// the page (as the book's citations are), and a Text tab (the markdown, times linked by the remark plugin).
// RIGHT, the source: the recording itself — the debate as published on YouTube, playing in the page (owner
// 2026-10-09: "publish the actual view in the same screen, not just its transcript") — above the transcript, one
// row per turn, every Time cell a link. A time anywhere (a box on the PDF, a link in the text, a Time cell) plays
// the recording from that second here and marks the turn in progress; the links keep their YouTube href for a
// reader who wants the page there. Nothing from YouTube loads until the reader presses play or a time.
// Reading mode stacks the three parts in one column. Deep links: #enclosure-a, #transcript, #turn-<n>, #t=<s>.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlignLeft, ArrowLeft, BookOpen, Columns, ExternalLink, FileText, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import remarkDebateTimes from '@/lib/remark-debate-times';
import { clockLabel, recordingUrl, secondsFromRecordingUrl, servedPdf, turnAt, type DocPdf, type OpenLetterView, type Turn } from '@/lib/open-letter';
import { PdfViewer, type PdfHotBox } from '../_components/PdfViewer';
import { SiteHeader } from '../_components/SiteHeader';
import { SiteFooter } from '../_components/SiteFooter';

type Mode = 'review' | 'reading';
type Doc = 'letter' | 'enclosure' | 'text';
const MODE_KEY = 'jk-letter-mode';
// the panes' height is computed from constants plus their top edge, as on the book's review page (owner 2026-09-21)
const BELOW_PX = 48;
const BOTTOM_PAD_PX = 16;
const EMBED = 'https://www.youtube-nocookie.com';

// the archive prose type (ArticleBody's classes, without the card chrome: the pane is the card)
const PROSE = [
  'px-6 py-6 sm:px-8 font-serif text-[1.05rem] leading-relaxed text-ink/90 max-w-none',
  '[&>*:first-child]:mt-0',
  '[&_h1]:font-serif [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:mt-2 [&_h1]:mb-4 [&_h1]:text-ink',
  '[&_h2]:font-serif [&_h2]:text-xl [&_h2]:leading-snug [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-ink',
  '[&_p]:my-4 [&_ul]:my-4 [&_ol]:my-4 [&_ul]:pl-6 [&_ol]:pl-6 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-1.5',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-5 [&_blockquote]:my-6 [&_blockquote]:text-muted [&_blockquote]:italic',
  '[&_hr]:my-8 [&_hr]:border-rule [&_strong]:text-ink',
  '[&_code]:font-mono [&_code]:text-[0.85em] [&_code]:bg-well [&_code]:px-1 [&_code]:rounded',
].join(' ');

const timeLinkClass = 'underline decoration-accent/60 underline-offset-2 text-accent-ink hover:decoration-accent tabular-nums';

/** the letter's and the enclosure's markdown, debate times linked; a click plays the recording here */
function Prose({ md, youtubeId, onTime, className }: { md: string; youtubeId: string; onTime?: (t: number) => void; className?: string }) {
  const plugins = useMemo(() => [remarkGfm, [remarkDebateTimes, { youtubeId }] as const], [youtubeId]);
  return (
    <article className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={plugins as never}
        components={{
          a: ({ href, children, title }) => {
            const t = secondsFromRecordingUrl(href, youtubeId);
            if (t != null) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={timeLinkClass}
                  onClick={(e) => { if (onTime) { e.preventDefault(); onTime(t); } }}>
                  {children}
                </a>
              );
            }
            const external = /^https?:\/\//.test(href ?? '');
            return <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="underline text-accent-ink">{children}</a>;
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </article>
  );
}

// the three browser facts the layout reads — the viewport width class, the remembered mode, the panes' fill
// height — come through useSyncExternalStore (server snapshots: narrow, review, none), never a setState in an effect
const LG = '(min-width: 1024px)';
const subscribeLg = (cb: () => void) => { const m = window.matchMedia(LG); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const readLg = () => window.matchMedia(LG).matches;
const MODE_EVENT = 'jk-letter-mode-change';
const subscribeMode = (cb: () => void) => { window.addEventListener(MODE_EVENT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(MODE_EVENT, cb); window.removeEventListener('storage', cb); }; };
const readMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'reading' ? 'reading' : 'review'; } catch { return 'review'; } };
const writeMode = (m: Mode) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* no storage: the mode lives for this render only */ } window.dispatchEvent(new Event(MODE_EVENT)); };
const subscribeResize = (cb: () => void) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); };

/** the embed URL: the privacy-enhanced host, the page's origin for the widget's postMessage, from the second asked */
const embedUrl = (id: string, t: number) => `${EMBED}/embed/${id}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.max(0, Math.floor(t))}&autoplay=1&rel=0&modestbranding=1`;

export function OpenLetterBody({ c }: { c: OpenLetterView }) {
  const [override, setOverride] = useState<Mode | null>(null); // the mode chosen this render when storage is unavailable
  const [active, setActive] = useState<number | null>(null);
  const [activeHot, setActiveHot] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null); // a second asked by a deep link, before the reader presses play
  const [playerSrc, setPlayerSrc] = useState<string | null>(null);
  const hasLetterPdf = !!c.letter.pdf, hasEnclosurePdf = !!c.enclosure.pdf;
  const [doc, setDoc] = useState<Doc>(hasLetterPdf ? 'letter' : 'text');
  const rowRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const turns = c.transcript.turns;
  const id = c.recording.youtube_id;

  const isLg = useSyncExternalStore(subscribeLg, readLg, () => false);
  const storedMode = useSyncExternalStore(subscribeMode, readMode, () => 'review' as Mode);
  const mode: Mode = override ?? storedMode;
  const changeMode = (m: Mode) => { setOverride(m); writeMode(m); };

  const reading = mode === 'reading';
  const review = !reading && isLg;

  // the panes fill the viewport in side-by-side review: constants plus the row's top edge, never the content's height
  const readFill = useCallback(() => {
    if (!review) return null;
    const el = rowRef.current;
    if (!el) return null;
    return Math.max(520, Math.round(window.innerHeight - el.getBoundingClientRect().top - BELOW_PX - BOTTOM_PAD_PX));
  }, [review]);
  const fillHeight = useSyncExternalStore(subscribeResize, readFill, () => null);

  /** the widget protocol of the embedded player, without YouTube's script: a listening handshake, then commands */
  const post = useCallback((msg: Record<string, unknown>) => { playerRef.current?.contentWindow?.postMessage(JSON.stringify(msg), EMBED); }, []);
  const onPlayerLoad = useCallback(() => { post({ event: 'listening', id: 1, channel: 'widget' }); }, [post]);

  /** mark the turn in progress at second t; in review mode bring it into the transcript pane */
  const showTurn = useCallback((t: number, scroll: boolean) => {
    const turn = turnAt(turns, t);
    if (!turn) return;
    setActive(turn.n);
    if (!scroll) return;
    const row = document.getElementById(`turn-${turn.n}`);
    const pane = transcriptRef.current;
    if (!row || !pane || !pane.contains(row)) return;
    // a <tr>'s offsetTop is measured from its table, not the pane: take the row's distance from the pane's top edge
    const delta = row.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    pane.scrollTo({ top: pane.scrollTop + delta - pane.clientHeight / 3, behavior: 'smooth' });
  }, [turns]);

  /** play the recording from second t, here on the page: the owner's file in the <video> when there is one (no
      third party), else the embed — the first time loads the player, after that it seeks */
  const goTo = useCallback((t: number) => {
    showTurn(t, true);
    setPending(null);
    const v = videoRef.current;
    if (v) { v.currentTime = Math.max(0, t); void v.play().catch(() => { /* the browser wants a gesture first: the time is set, the reader presses play */ }); return; }
    if (!playerSrc) { setPlayerSrc(embedUrl(id, t)); return; }
    post({ event: 'command', func: 'seekTo', args: [Math.max(0, Math.floor(t)), true] });
    post({ event: 'command', func: 'playVideo', args: [] });
  }, [id, playerSrc, post, showTurn]);

  // a deep link: a turn (#turn-12) or a second (#t=169) marks the turn and arms the play button; #enclosure-a picks the tab
  useEffect(() => {
    const h = window.location.hash;
    if (h === '#enclosure-a') { setTimeout(() => setDoc(hasEnclosurePdf ? 'enclosure' : 'text'), 0); return; }
    const m = h.match(/^#turn-(\d+)$/) || h.match(/^#t=(\d+)$/);
    if (!m) return;
    const t = h.startsWith('#t=') ? Number(m[1]) : (turns.find((x) => x.n === Number(m[1]))?.t ?? null);
    if (t != null) setTimeout(() => { setPending(t); showTurn(t, true); }, 50);
  }, [turns, showTurn, hasEnclosurePdf]);

  // the hit boxes over the chosen PDF: one per word a time runs through (scripts/import-open-letter.mjs)
  const pdf: DocPdf | null = doc === 'letter' ? c.letter.pdf : doc === 'enclosure' ? c.enclosure.pdf : null;
  const { hotBoxes, hotSeconds } = useMemo(() => {
    const boxes: PdfHotBox[] = []; const secs = new Map<string, number>();
    (pdf?.boxes ?? []).forEach((b, i) => { const bid = `${doc}:${i}`; boxes.push({ id: bid, page: b.page, rect: b.rect, kind: 'unit', title: `Play the recording at ${clockLabel(b.t)}` }); secs.set(bid, b.t); });
    return { hotBoxes: boxes, hotSeconds: secs };
  }, [pdf, doc]);
  const onHot = useCallback((box: PdfHotBox) => { const t = hotSeconds.get(box.id); if (t == null) return; setActiveHot(box.id); goTo(t); }, [hotSeconds, goTo]);

  const paneShell = 'bg-card border border-rule rounded-lg shadow-card flex flex-col min-h-0';
  const barTitle = 'font-serif text-[15px] leading-none';
  const speakerName = (s: string) => s.split('/').map((p) => c.transcript.speakers[p.replace(/\s*\(.*\)$/, '')] ?? p).join(' / ') + (/\(crosstalk\)/.test(s) ? ' (crosstalk)' : '');
  const tabClass = (on: boolean) => cn('h-7 px-2 inline-flex items-center gap-1 rounded text-xs whitespace-nowrap transition-colors', on ? 'bg-accent/20 text-accent-ink' : 'text-muted hover:bg-well');
  const tabs = (
    <span className="inline-flex items-center gap-0.5">
      {hasLetterPdf && <button type="button" className={tabClass(doc === 'letter')} onClick={() => setDoc('letter')} aria-pressed={doc === 'letter'} title="The letter — the owner's PDF, every debate time a hit box"><FileText className="h-3.5 w-3.5" /> The letter</button>}
      {hasEnclosurePdf && <button type="button" className={tabClass(doc === 'enclosure')} onClick={() => setDoc('enclosure')} aria-pressed={doc === 'enclosure'} title="Enclosure A — the record and the debate, point by point"><FileText className="h-3.5 w-3.5" /> Enclosure A</button>}
      <button type="button" className={tabClass(doc === 'text')} onClick={() => setDoc('text')} aria-pressed={doc === 'text'} title="The letter and the enclosure as text, with the same time links"><AlignLeft className="h-3.5 w-3.5" /> Text</button>
    </span>
  );

  const documentPane = (
    <div className={cn('min-w-0', review && 'h-full min-h-0 flex flex-col')}>
      {pdf ? (
        <PdfViewer key={pdf.file} src={servedPdf(pdf)} bytes={pdf.bytes} downloadName={`${doc === 'letter' ? 'open-letter' : 'enclosure-a'}-mn-ag-candidates.pdf`}
          title={`${doc === 'letter' ? c.letter.title : c.enclosure.title} — ${c.letter.date_line ?? ''}; a debate time on the page plays the recording from that moment`}
          height={review ? 'fill' : 'page'} chrome="pane" leading={tabs} hotBoxes={hotBoxes} activeHot={activeHot} onHot={onHot} />
      ) : (
        <div className={cn(paneShell, review && 'h-full')}>
          <div className="h-11 px-4 flex items-center justify-between gap-3 border-b border-rule">
            {tabs}
            <span className="text-xs text-muted shrink-0">{c.letter.date_line ?? 'Open letter'}</span>
          </div>
          <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">
            {c.letter.title} — debate times are links; each plays the recording from that moment.
          </div>
          <div className={cn('min-h-0', review ? 'flex-1 overflow-y-auto' : '')}>
            {/* the letter's one rule is its signature line (a row of underscores in the text): a short rule at the left, not a page-wide break */}
            <Prose md={c.letter.markdown} youtubeId={id} onTime={goTo} className="[&_hr]:w-64 [&_hr]:ml-0 [&_hr]:my-2 [&_hr]:border-ink/50" />
            <hr className="mx-6 sm:mx-8 border-rule" />
            <div id="enclosure-a" className="scroll-mt-4">
              <Prose md={c.enclosure.markdown} youtubeId={id} onTime={goTo} />
            </div>
          </div>
          <div className="h-8 border-t border-rule px-4 flex items-center text-xs text-muted">
            <a href="#enclosure-a" className="underline text-accent-ink">Enclosure A</a>
            <span className="mx-2">·</span>
            <a href="#transcript" className="underline text-accent-ink">The transcript</a>
          </div>
        </div>
      )}
    </div>
  );

  const player = (
    <div className="shrink-0 border-b border-rule bg-black">
      <div className="relative w-full" style={{ aspectRatio: '16 / 9', maxHeight: review ? '45vh' : undefined }}>
        {c.recording.file ? (
          // the owner's own copy of the broadcast: a plain <video>, nothing from any third party, no ads
          <video ref={videoRef} src={c.recording.file.url} controls preload="metadata" playsInline className="absolute inset-0 h-full w-full bg-black"
            title={c.recording.title ?? 'The debate'} aria-label={`${c.recording.title ?? 'The debate'} — the recording`} />
        ) : playerSrc ? (
          <iframe ref={playerRef} src={playerSrc} onLoad={onPlayerLoad} title={c.recording.title ?? 'The debate'} className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <button type="button" onClick={() => goTo(pending ?? 0)}
            className="absolute inset-0 h-full w-full flex flex-col items-center justify-center gap-3 text-paper/90 hover:text-paper bg-gradient-to-b from-ink/80 to-black"
            title="Play the recording here — it loads from YouTube when you press play">
            <span className="h-16 w-16 rounded-full border-2 border-paper/70 flex items-center justify-center bg-black/40"><Play className="h-7 w-7 ml-1" aria-hidden /></span>
            <span className="font-serif text-base px-6 text-center leading-snug">{c.recording.title ?? 'The debate'}</span>
            <span className="text-xs text-paper/70 px-6 text-center">{pending != null ? `Play from ${clockLabel(pending)}` : 'Play the debate'} — loads from YouTube when you press play; a time in the letter plays from that moment</span>
          </button>
        )}
      </div>
    </div>
  );

  const transcriptPane = (
    <div id="transcript" className={cn('min-w-0 scroll-mt-4', review && 'h-full min-h-0 flex flex-col')}>
      <div className={cn(paneShell, review && 'h-full')}>
        <div className="h-11 px-4 flex items-center justify-between gap-3 border-b border-rule">
          <span className={cn(barTitle, 'truncate')} style={{ fontWeight: 620 }}>
            The debate <span className="text-muted font-sans text-xs ml-2" style={{ fontWeight: 500 }}>{c.recording.programme} · October 2, 2026</span>
          </span>
          <a href={c.recording.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-ink inline-flex items-center gap-1 no-underline hover:underline shrink-0">
            On YouTube <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
        <div className="h-8 px-4 flex items-center text-xs text-muted truncate border-b border-rule">
          A time plays the recording from that second · {Object.entries(c.transcript.speakers).map(([k, v]) => `${k} = ${v}${k === 'MOD' ? ', moderator' : ''}`).join(' · ')}
        </div>
        {player}
        <div ref={transcriptRef} className={cn('min-h-0', review ? 'flex-1 overflow-y-auto' : '')}>
          <div className="px-4 py-3 text-xs text-muted leading-relaxed border-b border-rule space-y-2">
            <p className="font-serif text-sm text-ink/90" style={{ fontWeight: 600 }}>{c.transcript.title}</p>
            <p>{c.transcript.source}</p>
            <Prose md={`**Method:** ${c.transcript.method}`} youtubeId={id} onTime={goTo} className="!p-0 !font-sans !text-xs !leading-relaxed !text-muted [&_p]:!my-0 [&_strong]:!text-muted" />
          </div>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left font-sans text-[11px] uppercase tracking-wider text-muted">
                <th className="pl-4 pr-2 py-2 border-b border-rule w-10">Turn</th>
                <th className="px-2 py-2 border-b border-rule w-20">Time</th>
                <th className="px-2 py-2 border-b border-rule w-14">Speaker</th>
                <th className="pl-2 pr-4 py-2 border-b border-rule">Text</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((r: Turn) => (
                <tr key={r.n} id={`turn-${r.n}`} data-t={r.t} className={cn('align-top scroll-mt-10 transition-colors', active === r.n ? 'bg-accent/15' : 'hover:bg-well/60')}>
                  <td className="pl-4 pr-2 py-2 border-b border-rule/60 text-xs text-muted tabular-nums">{r.n}</td>
                  <td className="px-2 py-2 border-b border-rule/60 whitespace-nowrap">
                    <a href={recordingUrl(id, r.t)} target="_blank" rel="noopener noreferrer" title={`Play the recording at ${r.time}`} className={cn(timeLinkClass, 'text-xs')}
                      onClick={(e) => { e.preventDefault(); goTo(r.t); }}>{r.time}</a>
                  </td>
                  <td className="px-2 py-2 border-b border-rule/60 text-xs" title={speakerName(r.speaker)}>{r.speaker}</td>
                  <td className="pl-2 pr-4 py-2 border-b border-rule/60 leading-relaxed text-ink/90">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="h-8 border-t border-rule px-4 flex items-center text-xs text-muted truncate">
          {turns.length} turns · {c.recording.duration ?? ''} on the recording’s clock · machine transcript, two hearings, no human ear yet
        </div>
      </div>
    </div>
  );

  const toggle = (
    <button type="button" onClick={() => changeMode(reading ? 'review' : 'reading')} aria-pressed={!reading}
      title={reading ? 'Reading mode — press for review mode: the document beside the recording it quotes' : 'Review mode — press for reading mode: the document, then the recording and its transcript, in one column'}
      className={cn('inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.06em] rounded-md px-2 py-0.5 border transition-colors',
        reading ? 'text-ink/80 border-rule bg-card hover:bg-well' : 'text-accent-ink border-accent/40 bg-accent/15 hover:bg-accent/25')}
      style={{ fontWeight: 600 }}>
      {reading ? <BookOpen className="h-3.5 w-3.5" aria-hidden /> : <Columns className="h-3.5 w-3.5" aria-hidden />}
      {reading ? 'Reading mode' : 'Review mode'}
    </button>
  );

  const record: ReactNode = (
    <div className={cn('mt-3 min-h-9 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 text-[11px] text-muted leading-relaxed', !review && 'max-w-5xl mx-auto')}>
      <div className="min-w-0">
        <span style={{ fontWeight: 600 }}>{c.letter.title}</span>, {c.letter.date_line ?? ''}, with Enclosure A — {hasLetterPdf ? 'the documents as rendered, with their text beside them' : 'the text as of ' + new Date(c.generated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })}.
      </div>
      <div className="min-w-0">
        The debate: {c.recording.title ?? c.recording.programme}, {c.recording.programme}, October 2, 2026 — <a href={c.recording.url} target="_blank" rel="noopener noreferrer" className="underline text-accent-ink">the recording on YouTube</a>; times are on the recording’s own clock.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main id="main-content" className={cn('flex-grow w-full', review ? 'max-w-none px-4 py-4' : 'mx-auto max-w-site px-5 sm:px-8 py-6')}>
        <div className="mb-3 flex flex-wrap items-center gap-2 min-w-0">
          <Link href="/" className="inline-flex items-center text-sm text-muted hover:text-ink no-underline mr-1"><ArrowLeft className="h-4 w-4 mr-1.5" />kirchner.ink</Link>
          {toggle}
        </div>
        <div ref={rowRef}
          className={cn('grid grid-cols-1 gap-4', review ? 'lg:grid-cols-2 lg:items-stretch' : 'max-w-5xl mx-auto')}
          style={review && fillHeight ? { height: fillHeight } : undefined}>
          {documentPane}
          {transcriptPane}
        </div>
        {record}
      </main>
      <SiteFooter />
    </div>
  );
}
