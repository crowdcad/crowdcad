'use client';

// Small pieces shared by the MCI tab's cards, the totals strip and the log drawer.

import React from 'react';
import { MapPin } from 'lucide-react';
import { Modal, ModalContent, type ModalProps } from '@heroui/react';
import type { MciColor } from '@/app/types';
import { MCI_COLORS, sumCounts, type MciCounts } from '@/lib/mci';

/** Hides a number input's spinner arrows. */
export const NO_SPINNER = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** HeroUI Input classNames for the MCI dialogs and tab. The wrapper's focus ring is removed globally (globals.css). */
export const MCI_INPUT_CLASSNAMES = {
  inputWrapper: 'rounded-xl px-3',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;

/** The red-tinted Cancel / Skip button in every MCI dialog footer. */
export const MCI_CANCEL_BUTTON = 'bg-status-red/20 px-4 py-2 text-status-red hover:bg-status-red/30';

/** The shell every MCI dialog shares. `children` renders the form, keyed by the caller so it starts fresh. */
export function MciModal({
  isOpen,
  onClose,
  testId,
  size,
  topClass = 'mt-20',
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  testId: string;
  /** Wider dialogs also scroll inside. */
  size?: ModalProps['size'];
  topClass?: string;
  children: () => React.ReactNode;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="top-center"
      backdrop="opaque"
      hideCloseButton
      radius="lg"
      {...(size ? { size, scrollBehavior: 'inside' as const } : {})}
      classNames={{ base: `${topClass} rounded-lg bg-surface-deepest text-surface-light`, header: 'pb-0', footer: 'pt-0', body: 'minimal-scrollbar' }}
    >
      <ModalContent data-testid={testId}>{children}</ModalContent>
    </Modal>
  );
}

/** The draw/edit-on-map pin beside a zone or treatment location name. */
export function MciMapButton({ name, hasShape, onPress, testId }: { name: string; hasShape: boolean; onPress: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      aria-label={`${hasShape ? 'Edit' : 'Draw'} ${name} on the map`}
      title={hasShape ? 'Edit on the map' : 'Draw on the map'}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-surface-liner ${hasShape ? 'text-surface-faint' : 'text-status-orange'}`}
      data-testid={testId}
    >
      <MapPin className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * A count per color, each capped at what is available: the Move and Transport dialogs.
 * `verb` names the column and each input ("Move red"); empty colors can be disabled.
 */
export function MciCountInputs({
  colors = MCI_COLORS,
  available,
  availableLabel,
  verb,
  counts,
  onChange,
  disableEmpty = false,
  testIdPrefix,
  className = '',
}: {
  colors?: readonly MciColor[];
  available: MciCounts;
  availableLabel: string;
  verb: string;
  counts: MciCounts;
  onChange: (next: MciCounts) => void;
  disableEmpty?: boolean;
  testIdPrefix: string;
  className?: string;
}) {
  const set = (color: MciColor, raw: string) => {
    const n = Number.parseInt(raw, 10);
    onChange({ ...counts, [color]: Number.isFinite(n) ? Math.max(0, Math.min(n, available[color])) : 0 });
  };
  return (
    <div className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 text-sm ${className}`}>
      <span className="text-xs text-surface-faint" />
      <span className="text-xs text-surface-faint">{availableLabel}</span>
      <span className="text-xs text-surface-faint">{verb}</span>
      {colors.map((color) => (
        <React.Fragment key={color}>
          <span className="inline-flex items-center gap-1.5 text-surface-light">
            <MciColorDot color={color} />
            {MCI_COLOR_STYLES[color].label}
          </span>
          <span className="text-center tabular-nums text-surface-light">{available[color]}</span>
          <input
            type="number"
            min={0}
            max={available[color]}
            inputMode="numeric"
            disabled={disableEmpty && available[color] <= 0}
            aria-label={`${verb} ${MCI_COLOR_STYLES[color].label.toLowerCase()}`}
            value={counts[color]}
            onChange={(e) => set(color, e.target.value)}
            className={`h-8 w-16 disabled:opacity-40 ${MCI_NUMBER_INPUT}`}
            data-testid={`${testIdPrefix}-${color}`}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export const MCI_COLOR_STYLES: Record<MciColor, { label: string; dotClass: string; textClass: string; borderLeftClass: string }> = {
  red: { label: 'Red', dotClass: 'bg-red-500 border-red-300', textClass: 'text-red-400', borderLeftClass: 'border-l-red-500' },
  yellow: { label: 'Yellow', dotClass: 'bg-yellow-400 border-yellow-200', textClass: 'text-yellow-300', borderLeftClass: 'border-l-yellow-400' },
  green: { label: 'Green', dotClass: 'bg-green-500 border-green-300', textClass: 'text-green-400', borderLeftClass: 'border-l-green-500' },
  black: { label: 'Black', dotClass: 'bg-neutral-900 border-neutral-500', textClass: 'text-surface-faint', borderLeftClass: 'border-l-neutral-500' },
};

/** The Tagged pill: a solid tag color behind the - number + control, with text that reads on it. */
export const MCI_PILL_STYLES: Record<MciColor, { pill: string }> = {
    red: { pill: 'bg-red-600 text-white' },
    yellow: { pill: 'bg-yellow-400 text-neutral-900' },
    green: { pill: 'bg-green-600 text-white' },
    black: { pill: 'bg-neutral-800 text-white' },
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
export const MCI_NUMBER_INPUT = `rounded-md border border-surface-liner bg-surface-liner/40 text-center tabular-nums text-surface-light outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus:border-surface-faint ${NO_SPINNER} [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0`;

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

/** HH:MM:SS local time. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
