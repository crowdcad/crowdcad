'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findStepTarget } from '@/training/anchors';
import type { TrainingStep } from '@/training/types';

/**
 * Points at the control a training step is about: a ring around it and an
 * accent callout (the Lite TutorialTip look) beside it. It follows the
 * control as the board scrolls, resizes or re-renders, never takes clicks,
 * and shows nothing while the control is not on screen.
 */

type Rect = { top: number; left: number; width: number; height: number };

const sameRect = (a: Rect | null, b: Rect | null) =>
  !!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

/** Watches where a step's target is, every animation frame. */
export function useStepTargetRect(step: TrainingStep | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last: Rect | null = null;
    const loop = () => {
      // Hidden while the Help dropdown is open, so it never covers the results.
      const el = document.querySelector('[data-testid="help-panel"]') ? null : findStepTarget(step);
      const r = el?.getBoundingClientRect();
      const next = r ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null;
      if (!sameRect(last, next) && (last || next)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [step]);
  return rect;
}

/** Just above React Aria's overlay z-index (100000). */
const COACHMARK_Z = 100001;
/** The step card (and Help's guide card) sit above the coachmark, so its dimmed surround never covers them. */
export const TRAINING_CARD_Z = COACHMARK_Z + 1;

const PAD = 6;
/** The callout fits its text, up to this width. */
const TIP_MAX_W = 320;

export default function Coachmark({ step, label }: { step: TrainingStep | null; label: string }) {
  const rect = useStepTargetRect(step);
  // The callout's rendered width, for placing it: it grows with the label.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(TIP_MAX_W);
  useLayoutEffect(() => {
    const w = tipRef.current?.offsetWidth;
    if (w) setTipW(w);
  }, [label, rect]);
  if (!step || !rect) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const ring = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  // Prefer the step's side; fall back to whichever side has room.
  const room = { bottom: vh - (ring.top + ring.height), top: ring.top, right: vw - (ring.left + ring.width), left: ring.left };
  let side = step.placement ?? 'bottom';
  if ((side === 'bottom' || side === 'top') && room[side] < 70) side = side === 'bottom' ? 'top' : 'bottom';
  if ((side === 'left' || side === 'right') && room[side] < tipW + 24) side = room.bottom > 70 ? 'bottom' : 'top';

  const clampX = (x: number) => Math.max(8, Math.min(vw - tipW - 8, x));
  const clampY = (y: number) => Math.max(8, Math.min(vh - 60, y));
  const tipStyle: React.CSSProperties =
    side === 'bottom'
      ? { top: ring.top + ring.height + 10, left: clampX(ring.left + ring.width / 2 - tipW / 2) }
      : side === 'top'
        ? { top: ring.top - 10, left: clampX(ring.left + ring.width / 2 - tipW / 2), transform: 'translateY(-100%)' }
        : side === 'right'
          ? { top: clampY(ring.top + ring.height / 2 - 20), left: ring.left + ring.width + 12 }
          : { top: clampY(ring.top + ring.height / 2 - 20), left: ring.left - tipW - 12 };

  const arrow: React.CSSProperties =
    side === 'bottom'
      ? { top: -6, left: Math.max(10, Math.min(tipW - 22, ring.left + ring.width / 2 - (tipStyle.left as number) - 6)) }
      : side === 'top'
        ? { bottom: -6, left: Math.max(10, Math.min(tipW - 22, ring.left + ring.width / 2 - (tipStyle.left as number) - 6)) }
        : side === 'right'
          ? { left: -6, top: 14 }
          : { right: -6, top: 14 };

  return (
    // Above React Aria's popovers (HeroUI dropdowns, selects), which position themselves at an inline z-index of
    // 100000: the ring must show on top of an open menu. It never takes clicks, so the menu still works underneath.
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: COACHMARK_Z }} data-testid="training-coachmark">
      <div
        // The ring is an outline: the box-shadow is the dimmed surround, and Tailwind's ring is a box-shadow too.
        className="absolute rounded-lg outline outline-2 outline-accent transition-all duration-150"
        style={{ ...ring, boxShadow: '0 0 0 9999px rgba(0,0,0,0.28)' }}
      />
      <div
        role="note"
        ref={tipRef}
        className="absolute w-max rounded-lg bg-accent px-3 py-2 text-base font-medium leading-snug text-accent-foreground shadow-lg"
        style={{ ...tipStyle, maxWidth: TIP_MAX_W }}
      >
        <span className="absolute h-3 w-3 rotate-45 bg-accent" style={arrow} />
        <span className="relative">{label}</span>
      </div>
    </div>
  );
}
