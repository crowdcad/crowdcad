// statuslabel.tsx
'use client';

import React from 'react';
import { HousePlus, Ambulance } from '@/components/ui/icons';

/**
 * Icon shown alongside a status/outcome's translated label, keyed by the
 * internal status/outcome value (never the translated text, which varies by
 * dispatch vocabulary preset).
 */
const STATUS_ICONS: Record<string, typeof HousePlus> = {
  Transporting: HousePlus,
  Delivered: HousePlus,
  'Rolled from Scene': Ambulance,
  'Pending Transport': Ambulance,
  Transported: Ambulance,
};

type StatusLabelProps = {
  /** Internal status/outcome value — looked up in STATUS_ICONS, never rendered directly. */
  status: string;
  /** Translated (or destination-decorated) text to display. */
  text: string;
  /**
   * Force the icon off even when STATUS_ICONS has one for this status — used
   * when a real clinic name is already spelled out in `text` (e.g.
   * getTransportingLabel/getDeliveredLabel with multiple clinics), where the
   * generic icon would read as redundant clutter. Defaults to true.
   */
  showIcon?: boolean;
  className?: string;
};

/** Renders a status/outcome's label with its status-specific icon, when one exists. */
export default function StatusLabel({ status, text, showIcon = true, className }: StatusLabelProps) {
  const Icon = showIcon ? STATUS_ICONS[status] : undefined;
  return (
    <span className={`inline-flex items-center gap-1 ${className || ''}`}>
      <span>{text}</span>
      {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
    </span>
  );
}

/**
 * Word appended to a status's label in a dropdown MENU (list of choices),
 * standing in for the icon shown on the equivalent PILL (persistent current-
 * value display) — icons are reserved for the pill; menu options spell the
 * same thing out as a word instead. Derived from STATUS_ICONS so the two
 * never drift apart.
 */
const MENU_LABEL_SUFFIX: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_ICONS).map(([status, Icon]) => [status, Icon === HousePlus ? 'Clinic' : 'Ambulance'])
);

/**
 * Full-text replacements for a dropdown MENU option only — the pill keeps
 * showing the short/abbreviated form (via `t(status)`). NMM reads as jargon
 * in a list of choices a dispatcher is actively picking from, but the
 * abbreviation is worth keeping on the persistent pill once selected.
 */
const MENU_LABEL_OVERRIDES: Record<string, string> = {
  NMM: 'No Medical Merit',
};

/** Plain-text label for a status/outcome inside a dropdown menu — no icon, just the word the pill's icon stands for appended (e.g. "Transporting to Clinic", "Transferred to Ambulance"). */
export function getMenuLabel(status: string, t: (key: string) => string): string {
  if (MENU_LABEL_OVERRIDES[status]) return MENU_LABEL_OVERRIDES[status];
  const suffix = MENU_LABEL_SUFFIX[status];
  return suffix ? `${t(status)} ${suffix}` : t(status);
}
