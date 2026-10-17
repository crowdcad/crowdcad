'use client';

import React from 'react';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { useElapsedSeconds } from '@/hooks/useMMSS';
import { formatElapsed } from './mciparts';

type Props = {
  active: boolean;
  /** Epoch ms the current MCI period started; only read while `active`. */
  startedAt?: number;
  onDeclare: () => void;
  /** While active the button takes the dispatcher to the MCI tab. */
  onOpenTab: () => void;
};

/** Declare MCI, beside the Surge toggle. While an MCI is active it shows the elapsed time and opens the MCI tab. */
export default function MciToggleButton({ active, startedAt, onDeclare, onOpenTab }: Props) {
  const { t } = useDispatchTerms();
  const elapsed = useElapsedSeconds(active ? startedAt : undefined);
  return (
    <button
      type="button"
      onClick={active ? onOpenTab : onDeclare}
      data-testid="mci-declare-button"
      aria-label={active ? 'Open MCI tab' : t('Declare MCI')}
      className={`self-start shrink-0 h-8 px-4 flex items-center rounded-md border text-[15px] sm:text-base font-semibold tabular-nums transition-colors ${
        active
          ? 'border-status-card-ring-red bg-status-card-red text-surface-light'
          : 'border-surface-liner bg-transparent text-surface-faint hover:text-surface-light hover:bg-surface-liner/30'
      }`}
    >
      {active ? (
        <>
          {t('MCI')}: <span className="ui-timer ml-1">{formatElapsed(elapsed)}</span>
        </>
      ) : (
        t('Declare MCI')
      )}
    </button>
  );
}
