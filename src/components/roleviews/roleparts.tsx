'use client';

import React, { useState } from 'react';
import type { MciColor } from '@/app/types';
import { MCI_COLOR_STYLES, MCI_PILL_STYLES } from '@/components/dispatch/mci/mciparts';
import { sendRoleAction } from '@/lib/roleActionClient';
import type { RoleAction } from '@/lib/mciRoleActions';

/**
 * Shared pieces of the MCI role views (#144): sized for a phone, big touch
 * targets, the condensed look. The mockup they follow is kept in step with
 * them (see docs/mci/decisions.md, D20).
 */

export const ROLE_LABEL = 'text-xs font-semibold uppercase tracking-[0.12em] text-surface-faint';
export const ROLE_CHIP = 'h-11 px-3.5 border text-base font-semibold';
export const chipState = (on: boolean) => (on ? 'border-accent bg-accent/15 text-surface-light' : 'border-surface-liner bg-surface-deep text-surface-light');
export const PRIMARY_BUTTON = 'h-14 bg-accent px-4 text-lg font-bold text-surface-deepest disabled:bg-surface-liner disabled:text-surface-faint disabled:cursor-not-allowed';
export const SECONDARY_BUTTON = 'h-14 border border-surface-liner bg-surface-deep px-4 text-base font-semibold text-surface-light disabled:opacity-50';

/** Sends role actions with one busy flag and the last error, shown in the view. */
export function useRoleActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (...actions: RoleAction[]): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      for (const action of actions) await sendRoleAction(action);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, send, clearError: () => setError(null) };
}

export function ErrorBanner({ error, onClose }: { error: string | null; onClose: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="mx-4 mt-3 flex items-center justify-between gap-3 border border-status-red/60 bg-status-red/15 px-3 py-2 text-base text-status-red" data-testid="role-error">
      <span>{error}</span>
      <button type="button" onClick={onClose} className="min-h-11 px-2 font-semibold">
        Dismiss
      </button>
    </div>
  );
}

/** A tag color's pill: − and + in the pill's own color either side of the number, as on the dispatch page's zone cards. */
export function ColorStepper({
  color,
  value,
  caption,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  size = 'lg',
  label,
}: {
  color: MciColor;
  value: number;
  caption?: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  size?: 'lg' | 'sm';
  label: string;
}) {
  const step = size === 'lg' ? 'h-14 w-14 text-3xl' : 'h-11 w-11 text-2xl';
  return (
    <div className={`flex items-center justify-between ${size === 'lg' ? 'h-14' : 'h-11'} ${MCI_PILL_STYLES[color].pill}`} data-testid={`role-stepper-${color}`}>
      <button type="button" className={`${step} flex items-center justify-center font-bold hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-40`} onClick={onMinus} disabled={minusDisabled} aria-label={`Remove one ${label}`}>
        −
      </button>
      <span className="flex flex-col items-center">
        <span className={`min-w-[3.2rem] bg-black/25 px-1.5 text-center font-mono font-bold tabular-nums ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>{value}</span>
        {caption && <span className="text-[11px] font-bold uppercase tracking-[0.1em]">{caption}</span>}
      </span>
      <button type="button" className={`${step} flex items-center justify-center font-bold hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-40`} onClick={onPlus} disabled={plusDisabled} aria-label={`Add one ${label}`}>
        +
      </button>
    </div>
  );
}

export function ColorTag({ color, className = '' }: { color: MciColor; className?: string }) {
  return <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold uppercase tracking-[0.08em] ${MCI_PILL_STYLES[color].pill} ${className}`}>{MCI_COLOR_STYLES[color].label}</span>;
}

/** A sheet that slides up from the bottom of the role view. */
export function BottomSheet({ title, children, onClose, testId }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; testId?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60" onClick={onClose} data-testid={testId}>
      <div className="flex max-h-[92vh] flex-col gap-3 overflow-y-auto border-t border-surface-liner bg-surface-deep px-4 pb-6 pt-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="text-2xl font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** "Are you sure?" before a submission changes the dispatch board. */
export function ConfirmDialog({
  title,
  lines,
  note,
  busy,
  onYes,
  onNo,
}: {
  title: string;
  lines: { color: MciColor; text: string }[];
  note: string;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
      <div role="alertdialog" aria-label={title} className="flex w-full max-w-md flex-col gap-3 border border-surface-liner bg-surface-deep p-5" data-testid="role-confirm">
        <span className="text-2xl font-bold">Are you sure?</span>
        <span className="text-lg">{title}</span>
        <div className="flex flex-col gap-1.5">
          {lines.map((l) => (
            <div key={l.color} className="flex items-center gap-3">
              <ColorTag color={l.color} className="w-20" />
              <span className="font-mono text-xl font-bold">{l.text}</span>
            </div>
          ))}
        </div>
        <span className="text-sm text-surface-faint">{note}</span>
        <div className="flex gap-2.5">
          <button type="button" className={`${SECONDARY_BUTTON} flex-1`} onClick={onNo}>
            Go back
          </button>
          <button type="button" className={`${PRIMARY_BUTTON} flex-[2]`} onClick={onYes} disabled={busy} data-testid="role-confirm-yes">
            Yes, submit
          </button>
        </div>
      </div>
    </div>
  );
}

const MAP_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

/** The round floating Map button on every role view. */
/** A round floating button, the shape of the Map button (#154). */
function RoundFab({ onPress, label, icon, text, bottomClass, testId }: { onPress: () => void; label: string; icon: React.ReactNode; text: string; bottomClass: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={`fixed right-4 ${bottomClass} z-30 flex h-14 w-14 flex-col items-center justify-center rounded-circle border border-accent bg-surface-deep text-[11px] font-bold text-accent shadow-[0_4px_14px_rgba(0,0,0,0.5)]`}
      data-testid={testId}
    >
      {icon}
      {text}
    </button>
  );
}

export function MapFab({ onPress, bottomClass = 'bottom-24' }: { onPress: () => void; bottomClass?: string }) {
  return <RoundFab onPress={onPress} label="Open map" icon={MAP_ICON} text="MAP" bottomClass={bottomClass} testId="role-map-button" />;
}

const BACK_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

/** Closes the map: in the Map button's place, so it toggles back to the view. */
export function MapBackFab({ onPress, bottomClass = 'bottom-24' }: { onPress: () => void; bottomClass?: string }) {
  return <RoundFab onPress={onPress} label="Back from map" icon={BACK_ICON} text="BACK" bottomClass={bottomClass} testId="role-map-back" />;
}
