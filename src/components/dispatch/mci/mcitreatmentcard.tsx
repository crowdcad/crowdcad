'use client';

import React from 'react';
import type { MciAreaStats } from '@/lib/mci';
import { MciCountsLine, MciTeamChips } from './mciparts';

type Props = {
  stats: MciAreaStats;
  /** Names of the teams in Treatment at this location. */
  teams: string[];
};

/** A treatment location: MCI patients moved in, by color, plus a clinic's regular patients. */
export default function MciTreatmentCard({ stats, teams }: Props) {
  const { name, isClinic, regular, receivedTotal } = stats;
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-surface-liner bg-surface-deepest p-3"
      aria-label={`${name} treatment location`}
      data-testid={`mci-area-${name}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-base font-bold text-surface-light">{name}</h3>
        {isClinic && (
          <span className="rounded-md border border-status-card-ring-blue bg-status-card-blue px-2 py-0.5 text-xs text-surface-light">Clinic</span>
        )}
      </header>

      {isClinic && (
        <p className="text-sm font-semibold text-surface-light" data-testid={`mci-area-combined-${name}`}>
          {regular} regular + {receivedTotal} MCI
        </p>
      )}
      {!isClinic && (
        <p className="text-sm font-semibold text-surface-light" data-testid={`mci-area-combined-${name}`}>
          {receivedTotal} MCI
        </p>
      )}

      <div className="text-sm" data-testid={`mci-area-counts-${name}`}>
        <MciCountsLine counts={stats.received} />
      </div>

      <MciTeamChips names={teams} emptyText="No teams in treatment" />
    </section>
  );
}
