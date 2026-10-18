'use client';

import React from 'react';
import type { Event } from '@/app/types';
import type { MciTotals } from '@/lib/mci';
import { useElapsedSeconds } from '@/hooks/useMMSS';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MciCountsLine, formatElapsed } from './mciparts';

type Props = {
  mci: NonNullable<Event['mci']>;
  totals: MciTotals;
};

function Stat({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 first:pl-0" data-testid={testId}>
      <span className="text-xs text-surface-faint">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-surface-light">{children}</span>
    </div>
  );
}

/** Time since declaration, patients found by color, in zones, in treatment (MCI) and regular clinic patients. */
export default function MciTotalsStrip({ mci, totals }: Props) {
  const { t } = useDispatchTerms();
  const period = mci.periods[mci.periods.length - 1];
  // While active the timer ticks; after stand down it holds the length of the last period.
  const live = useElapsedSeconds(mci.active ? period?.startedAt : undefined);
  const seconds = mci.active ? live : period?.endedAt && period.startedAt ? Math.floor((period.endedAt - period.startedAt) / 1000) : 0;

  return (
    <div className="flex flex-wrap items-end divide-x divide-surface-liner gap-y-2" data-testid="mci-totals-strip">
      <Stat label="Duration" testId="mci-timer">
        <span className="ui-timer !top-0">{formatElapsed(seconds)}</span>
      </Stat>
      <Stat label={t('Tagged')} testId="mci-total-tagged">
        <MciCountsLine counts={totals.tagged} />
      </Stat>
      <Stat label="In zones now" testId="mci-total-inzones">
        {totals.inZonesTotal}
      </Stat>
      <Stat label="In treatment now (MCI)" testId="mci-total-intreatment">
        {totals.inTreatmentTotal}
      </Stat>
      <Stat label={t('Transported')} testId="mci-total-transported">
        {totals.transportedTotal}
      </Stat>
      <Stat label="Regular clinic patients" testId="mci-total-regular">
        {totals.regularTotal}
      </Stat>
    </div>
  );
}
