'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Event } from '@/app/types';
import { getTeamAvailabilitySummary, getSurgeLimitPercent } from '@/lib/teamAvailability';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { STATUS_COLORS_HEX, hexToRgb } from '@/lib/colorTokens';

// Sourced from src/lib/colorTokens.js (the shared source of truth also used
// by tailwind.config.js) rather than duplicated here, because the strip
// needs a continuous interpolation between colors, not one of the discrete
// Tailwind status-* classes.
const STATUS_GREEN = hexToRgb(STATUS_COLORS_HEX.green);
const STATUS_ORANGE = hexToRgb(STATUS_COLORS_HEX.orange);
const STATUS_RED = hexToRgb(STATUS_COLORS_HEX.red);

// How many percentage points before the surge threshold the green→red ramp
// begins. Adjust this to make the warning transition longer or shorter.
const SURGE_RAMP_PERCENT = 20;

function rgbString(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r} ${c.g} ${c.b})`;
}

function lerpColor(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number): string {
  return rgbString({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
}

// Ramps green → orange → red so the color reaches full red exactly at
// surgeLimitPercent (instead of only starting to warm up there), with the
// green→orange leg starting SURGE_RAMP_PERCENT points before the threshold.
function surgeColor(positionPercent: number, surgeLimitPercent: number): string {
  const rampStart = Math.max(0, surgeLimitPercent - SURGE_RAMP_PERCENT);
  if (positionPercent <= rampStart) {
    return rgbString(STATUS_GREEN);
  }
  if (positionPercent >= surgeLimitPercent) {
    return rgbString(STATUS_RED);
  }
  const t = (positionPercent - rampStart) / Math.max(1, surgeLimitPercent - rampStart);
  return t <= 0.5
    ? lerpColor(STATUS_GREEN, STATUS_ORANGE, t / 0.5)
    : lerpColor(STATUS_ORANGE, STATUS_RED, (t - 0.5) / 0.5);
}

const BAR_COUNT = 14;

type Props = { event: Event };

// The count sits on a chip tinted like a team card's status pill
// (bg-status-card-* / border-status-card-ring-*), so the colors read the same.
// The number is raised 1px: Rajdhani digits sit below the line box's center.
function CountPill({ colorClass, count, label }: { colorClass: string; count: number; label: string }) {
  return (
    <span
      className={`min-w-7 h-6 px-1.5 inline-flex items-center justify-center rounded-md border text-sm font-semibold leading-none text-surface-light tabular-nums ${colorClass}`}
      aria-label={`${count} ${label}`}
    >
      <span className="inline-block -translate-y-px">{count}</span>
    </span>
  );
}

// Snaps a CSS length to whole device pixels. At a fractional zoom (e.g. 90%)
// a 4px bar is 3.6 device pixels, so equal bars render 3 or 4 pixels wide
// depending on where they land; whole-pixel widths and steps keep them equal.
function useDevicePixelSnap(): (cssPx: number) => number {
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    let media: MediaQueryList | null = null;
    const update = () => {
      setDpr(window.devicePixelRatio || 1);
      media?.removeEventListener('change', update);
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      media.addEventListener('change', update);
    };
    update();
    return () => media?.removeEventListener('change', update);
  }, []);
  return (cssPx: number) => Math.max(1, Math.round(cssPx * dpr)) / dpr;
}

export default function AvailabilitySurgeStrip({ event }: Props) {
  const { t } = useDispatchTerms();
  const summary = useMemo(() => getTeamAvailabilitySummary(event), [event]);
  const surgeLimitPercent = useMemo(() => getSurgeLimitPercent(event), [event]);
  const percentColor = surgeColor(summary.percentOnCalls, surgeLimitPercent);
  const snap = useDevicePixelSnap();
  const barWidth = snap(4);
  const barGap = snap(3);
  const barHeight = snap(20);

  return (
    <div
      className="w-full flex items-center justify-between gap-4 pl-2 pr-3 py-2 border-b border-surface-liner"
      data-testid="availability-surge-strip"
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <CountPill colorClass="border-status-card-ring-green bg-status-card-green" count={summary.available} label={t('Available')} />
        <CountPill colorClass="border-status-card-ring-blue bg-status-card-blue" count={summary.onBreakOrClinic} label={t('On Break/Clinic')} />
        <CountPill colorClass="border-status-card-ring-red bg-status-card-red" count={summary.onCalls} label={t('On Calls')} />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold tabular-nums" style={{ color: percentColor }}>
          {summary.percentOnCalls}%
        </span>
        <div className="flex items-center" style={{ gap: barGap, height: barHeight }} aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, i) => {
            const positionPercent = ((i + 1) / BAR_COUNT) * 100;
            const lit = positionPercent <= summary.percentOnCalls;
            return (
              <div
                key={i}
                className="shrink-0 rounded-sm transition-opacity duration-300"
                style={{
                  width: barWidth,
                  height: barHeight,
                  backgroundColor: surgeColor(positionPercent, surgeLimitPercent),
                  opacity: lit ? 1 : 0.25,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
