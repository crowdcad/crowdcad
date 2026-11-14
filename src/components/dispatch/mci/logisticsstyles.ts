/**
 * One set of classes for the Logistics board (Equipment, Hospitals, Incoming Staff), so the three columns
 * match: the same heading, card, title, field, button and muted text everywhere. Controls are taller below
 * laptop width, where the Logistics role login is used by touch.
 */

const FIELD =
  'h-10 lg:h-8 rounded-md border border-surface-liner bg-surface-liner/40 px-2.5 text-sm text-surface-light outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus:border-surface-faint disabled:opacity-60 placeholder:text-surface-faint';

const BUTTON_BASE = 'inline-flex h-10 lg:h-8 shrink-0 items-center justify-center gap-1 rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

export const LOGI = {
  heading: 'text-base font-bold text-surface-light',
  card: 'flex flex-col gap-1.5 rounded-lg border border-surface-liner px-3 py-2',
  title: 'text-sm font-semibold text-surface-light',
  meta: 'text-xs text-surface-faint',
  badge: 'text-xs font-semibold',
  empty: 'text-sm italic text-surface-faint',
  link: 'text-xs text-surface-faint underline hover:text-surface-light',
  input: FIELD,
  select: `${FIELD} pr-1`,
  primaryButton: `${BUTTON_BASE} bg-accent text-surface-light`,
  goodButton: `${BUTTON_BASE} bg-status-green/25 text-status-green hover:bg-status-green/35`,
  button: `${BUTTON_BASE} bg-surface-liner/60 text-surface-light hover:bg-surface-liner`,
  smallButton: 'inline-flex h-8 lg:h-7 shrink-0 items-center gap-1 rounded-md bg-surface-liner/60 px-2 text-xs font-semibold text-surface-light hover:bg-surface-liner',
  number: 'h-10 lg:h-8 w-16',
} as const;
