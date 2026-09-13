// LeafImageViewer — dependency-free zoom/pan viewer for large manuscript images,
// ported from the lawsofexistence.com MembraneViewer and re-skinned. Pinch or
// ctrl/⌘-wheel zooms at the cursor (plain scroll scrolls the page), double-click
// zooms in, drag pans, buttons zoom/fit. Auto-fits the pane width on load.
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  src: string;
  alt: string;
  heightClass?: string;
  fitMode?: 'width' | 'contain';
  /** header-bar label (the leaf); when set, the zoom controls move from a
      floating overlay into a header bar so the card matches its neighbour */
  title?: React.ReactNode;
  /** one-line sub-bar under the header (provenance / credit) */
  subtitle?: React.ReactNode;
}

const MIN = 0.1, MAX = 8, EDGE = 96;

export function LeafImageViewer({ src, alt, heightClass = 'h-[62vh] lg:h-[74vh]', fitMode = 'width', title, subtitle }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [t, setT] = useState({ scale: 0.28, x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const userAdjusted = useRef(false);
  const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));

  const clampPos = useCallback((x: number, y: number, scale: number) => {
    const box = boxRef.current, img = imgRef.current;
    if (!box || !img || !img.naturalWidth) return { x, y };
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const loX = EDGE - w, hiX = box.clientWidth - EDGE, loY = EDGE - h, hiY = box.clientHeight - EDGE;
    return {
      x: loX > hiX ? (box.clientWidth - w) / 2 : Math.min(hiX, Math.max(loX, x)),
      y: loY > hiY ? (box.clientHeight - h) / 2 : Math.min(hiY, Math.max(loY, y)),
    };
  }, []);

  const fit = useCallback(() => {
    const box = boxRef.current, img = imgRef.current;
    if (!box || !img || !img.naturalWidth) return;
    userAdjusted.current = false;
    const wScale = box.clientWidth / img.naturalWidth;
    const scale = clampScale(fitMode === 'contain' ? Math.min(wScale, box.clientHeight / img.naturalHeight, 1) : Math.min(wScale, 1));
    setT({
      scale,
      x: Math.max(0, (box.clientWidth - img.naturalWidth * scale) / 2),
      y: fitMode === 'contain' ? Math.max(0, (box.clientHeight - img.naturalHeight * scale) / 2) : 0,
    });
  }, [fitMode]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (userAdjusted.current) setT((prev) => ({ ...prev, ...clampPos(prev.x, prev.y, prev.scale) }));
      else fit();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [fit, clampPos]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const box = boxRef.current;
    if (!box) return;
    userAdjusted.current = true;
    const rect = box.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    setT((prev) => {
      const scale = clampScale(prev.scale * factor);
      const k = scale / prev.scale;
      return { scale, ...clampPos(cx - k * (cx - prev.x), cy - k * (cy - prev.y), scale) };
    });
  }, [clampPos]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1);
      zoomAt(e.clientX, e.clientY, Math.min(1.4, Math.max(1 / 1.4, Math.exp(-dy * 0.012))));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    let gScale = 1;
    const onGestureStart = (e: Event) => { e.preventDefault(); gScale = 1; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      if (!g.scale) return;
      zoomAt(g.clientX, g.clientY, g.scale / gScale);
      gScale = g.scale;
    };
    const onGestureEnd = (e: Event) => e.preventDefault();
    root.addEventListener('gesturestart', onGestureStart);
    root.addEventListener('gesturechange', onGestureChange);
    root.addEventListener('gestureend', onGestureEnd);
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('gesturestart', onGestureStart);
      root.removeEventListener('gesturechange', onGestureChange);
      root.removeEventListener('gestureend', onGestureEnd);
    };
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: t.x, oy: t.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    userAdjusted.current = true;
    const d = drag.current;
    setT((prev) => ({ ...prev, ...clampPos(d.ox + (e.clientX - d.startX), d.oy + (e.clientY - d.startY), prev.scale) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const zoomCenter = (factor: number) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    zoomAt(r.left + box.clientWidth / 2, r.top + box.clientHeight / 2, factor);
  };
  const ib = 'h-7 w-7 inline-flex items-center justify-center rounded hover:bg-well text-ink';
  const controls = (
    <div className="flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
      <button type="button" className={ib} onClick={() => zoomCenter(1 / 1.25)} aria-label="Zoom out" title="Zoom out"><ZoomOut className="h-4 w-4" /></button>
      <button type="button" className="h-7 min-w-[3rem] px-1 text-xs text-muted tabular-nums rounded hover:bg-well" onClick={fit} title="Fit to pane">{Math.round(t.scale * 100)}%</button>
      <button type="button" className={ib} onClick={() => zoomCenter(1.25)} aria-label="Zoom in" title="Zoom in"><ZoomIn className="h-4 w-4" /></button>
      <button type="button" className={ib} onClick={fit} aria-label="Fit to pane" title="Fit to pane"><Maximize2 className="h-4 w-4" /></button>
    </div>
  );

  return (
    <div ref={rootRef} className="relative h-full flex flex-col bg-well border border-rule rounded-lg overflow-hidden" style={{ overscrollBehavior: 'contain' }}>
      {title !== undefined ? (
        <>
          {/* header bar — mirrors the document pane's toolbar so both cards sit level */}
          <div className="flex items-center justify-between gap-3 h-11 px-3 border-b border-rule bg-card shrink-0">
            <div className="min-w-0 truncate font-serif text-[15px] text-ink" style={{ fontWeight: 620 }}>{title}</div>
            {controls}
          </div>
          {subtitle !== undefined && (
            <div className="h-8 px-3 flex items-center border-b border-rule bg-card/70 text-[11px] text-muted shrink-0">
              <div className="min-w-0 truncate w-full">{subtitle}</div>
            </div>
          )}
        </>
      ) : (
        <div className="absolute top-3 right-3 z-10 shadow-card">{controls}</div>
      )}
      <div
        ref={boxRef}
        // overflow-hidden: the transformed <img> is a stacking context and
        // would otherwise paint over the footer bar below the pan box
        className={cn('relative overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none', heightClass)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, e.altKey || e.shiftKey ? 0.5 : 2)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- transform-driven viewer; static export */}
        <img ref={imgRef} src={src} alt={alt} draggable={false} onLoad={fit} className="origin-top-left max-w-none"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, willChange: 'transform' }} />
      </div>
      <div className="h-8 px-3 flex items-center border-t border-rule bg-card/70 text-[11px] text-muted shrink-0 truncate">
        Pinch or ⌃-scroll to zoom · double-click zooms in (⇧ out) · drag to pan · ⤢ refits the leaf
      </div>
    </div>
  );
}
