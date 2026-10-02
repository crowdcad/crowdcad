'use client';

import React from 'react';
import { useElapsedSeconds, formatMMSS } from '@/hooks/useMMSS';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { useSurgeFlashing, surgeAlarmClass } from '@/hooks/useSurgeFlashing';

type Props = {
  active: boolean;
  /** Epoch ms the current surge started; only read while `active`. */
  startedAt?: number;
  onToggle: () => void;
};

/**
 * Inline button, opposite the Calls/Clinic tabs, for manually declaring a
 * team-wide surge (also auto-activated when the automatic percent-on-calls
 * threshold is crossed — see the effect in the dispatch page). Sits a small
 * gap above the tab card rather than flush against it like the tabs. While
 * active it ticks a live elapsed timer and pulses with the same
 * grey-to-alarm-orange animation as the Pending call chip
 * (`animate-pending-alarm`), so the two "something needs attention" signals
 * read as the same visual language. With flashing disabled in Preferences
 * (useSurgeFlashing) it holds a steady alarm orange instead.
 */
export default function SurgeToggleButton({ active, startedAt, onToggle }: Props) {
  const { t } = useDispatchTerms();
  const elapsed = useElapsedSeconds(active ? startedAt : undefined);
  const { flashingDisabled } = useSurgeFlashing();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? t('Disable surge') : t('Start surge')}
      data-testid="surge-toggle-button"
      className={`self-start shrink-0 h-8 px-4 flex items-center rounded-md border text-[15px] sm:text-base font-semibold tabular-nums transition-colors ${
        active
          ? `${surgeAlarmClass(flashingDisabled)} text-surface-light`
          : 'border-surface-liner bg-transparent text-surface-faint hover:text-surface-light hover:bg-surface-liner/30'
      }`}
    >
      {t('Surge')}: {active ? formatMMSS(elapsed) : t('Inactive')}
    </button>
  );
}
