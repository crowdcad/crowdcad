'use client';

// Small pieces shared by the MCI tab's cards, the totals strip and the log drawer.

import React from 'react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, sumCounts, type MciCounts } from '@/lib/mci';

export const MCI_COLOR_STYLES: Record<MciColor, { label: string; dotClass: string; textClass: string }> = {
  red: { label: 'Red', dotClass: 'bg-red-500 border-red-300', textClass: 'text-red-400' },
  yellow: { label: 'Yellow', dotClass: 'bg-yellow-400 border-yellow-200', textClass: 'text-yellow-300' },
  green: { label: 'Green', dotClass: 'bg-green-500 border-green-300', textClass: 'text-green-400' },
  black: { label: 'Black', dotClass: 'bg-neutral-900 border-neutral-500', textClass: 'text-surface-faint' },
};

export function MciColorDot({ color, className = '' }: { color: MciColor; className?: string }) {
  return (
    <span
      className={`inline-block h-3 w-3 shrink-0 rounded-circle border ${MCI_COLOR_STYLES[color].dotClass} ${className}`}
      aria-hidden
    />
  );
}

/** "R 2  Y 0  G 4  B 1" with the total, one inline row. */
export function MciCountsLine({ counts, testId }: { counts: MciCounts; testId?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={testId}>
      {MCI_COLORS.map((color) => (
        <span key={color} className="inline-flex items-center gap-1 tabular-nums" aria-label={`${counts[color]} ${MCI_COLOR_STYLES[color].label}`}>
          <MciColorDot color={color} />
          <span className="text-surface-light">{counts[color]}</span>
        </span>
      ))}
      <span className="font-semibold tabular-nums text-surface-light" aria-label={`${sumCounts(counts)} total`}>
        = {sumCounts(counts)}
      </span>
    </span>
  );
}

/** A typed patient count: an off-colored box (against the card's own background) with no spinner arrows. */
export const MCI_NUMBER_INPUT =
  'rounded-md border border-surface-liner bg-surface-liner/40 text-center tabular-nums text-surface-light outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus:border-surface-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0';

/** Teams working at a zone or treatment location. */
export function MciTeamChips({ names, emptyText }: { names: string[]; emptyText: string }) {
  if (names.length === 0) return <span className="text-xs italic text-surface-faint">{emptyText}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="rounded-md border border-status-card-ring-red bg-status-card-red px-1.5 py-0.5 text-xs text-surface-light">
          {name}
        </span>
      ))}
    </span>
  );
}

/** Elapsed time as H:MM:SS, or MM:SS under an hour. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
