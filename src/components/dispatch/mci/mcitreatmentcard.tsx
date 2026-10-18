'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { Button } from '@heroui/react';
import type { MciAreaStats, MciTransportTrip } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { MciCountsLine, MciTeamChips, formatClock } from './mciparts';

type Props = {
  stats: MciAreaStats;
  /** Names of the teams in Treatment at this location. */
  teams: string[];
  /** Ambulance trips that left from here, newest first. */
  trips: MciTransportTrip[];
  readOnly: boolean;
  onTransport: (areaId: string) => void;
  /** The venue has a map and this is not a clinic (a clinic is already a pin): show the draw-on-map button. */
  mapEnabled?: boolean;
  hasShape?: boolean;
  onDraw?: (areaId: string) => void;
};

/** A treatment location: MCI patients here now by color, a clinic's regular patients and what has left in an ambulance. */
export default function MciTreatmentCard({ stats, teams, trips, readOnly, onTransport, mapEnabled = false, hasShape = false, onDraw }: Props) {
  const { t } = useDispatchTerms();
  const [logOpen, setLogOpen] = useState(false);
  const { name, isClinic, regular, inTreatmentTotal, transportedTotal, receivedTotal } = stats;
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-surface-liner bg-surface-deepest p-3"
      aria-label={`${name} treatment location`}
      data-testid={`mci-area-${name}`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-base font-bold text-surface-light">{name}</h3>
          {mapEnabled && !isClinic && onDraw && (
            <button
              type="button"
              onClick={() => onDraw(stats.area.id)}
              aria-label={`${hasShape ? 'Edit' : 'Draw'} ${name} on the map`}
              title={hasShape ? 'Edit on the map' : 'Draw on the map'}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-surface-liner ${hasShape ? 'text-surface-faint' : 'text-status-orange'}`}
              data-testid={`mci-area-draw-${name}`}
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isClinic && (
          <span className="rounded-md border border-status-card-ring-blue bg-status-card-blue px-2 py-0.5 text-xs text-surface-light">Clinic</span>
        )}
      </header>

      <p className="text-sm font-semibold text-surface-light" data-testid={`mci-area-combined-${name}`}>
        {isClinic ? `${regular} regular + ${inTreatmentTotal} MCI` : `${inTreatmentTotal} MCI`}
      </p>

      <div className="text-sm" data-testid={`mci-area-counts-${name}`}>
        <MciCountsLine counts={stats.inTreatment} />
      </div>

      {receivedTotal > 0 && (
        <div className="flex flex-col gap-1 text-xs text-surface-faint" data-testid={`mci-area-transported-${name}`}>
          <span>
            Received {receivedTotal}. Transported {transportedTotal}.
          </span>
          {transportedTotal > 0 && <MciCountsLine counts={stats.transported} />}
        </div>
      )}

      {trips.length > 0 && (
        <div data-testid={`mci-area-transport-log-${name}`}>
          <button
            type="button"
            onClick={() => setLogOpen((open) => !open)}
            aria-expanded={logOpen}
            className="flex w-full items-center justify-between gap-2 text-xs font-bold text-surface-light"
            data-testid={`mci-area-transport-log-toggle-${name}`}
          >
            <span>
              {t('Transport')} log ({trips.length})
            </span>
            {logOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {logOpen && (
            <ul className="minimal-scrollbar mt-1 flex max-h-44 flex-col divide-y divide-surface-liner overflow-y-auto">
              {trips.map((trip) => (
                <li key={`${trip.t}|${trip.unit}|${trip.destination ?? ''}`} className="flex flex-col gap-0.5 py-1 text-xs" data-testid="mci-transport-trip">
                  <span className="text-surface-light">
                    <span className="mr-2 tabular-nums text-surface-faint">{formatClock(trip.t)}</span>
                    <span className="font-semibold">{trip.unit}</span>
                    {trip.destination ? ` to ${trip.destination}` : ''}
                  </span>
                  <MciCountsLine counts={trip.counts} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <MciTeamChips names={teams} emptyText="No teams in treatment" />
        {!readOnly && (
          <Button
            size="sm"
            radius="lg"
            className="shrink-0 bg-accent text-surface-light"
            isDisabled={inTreatmentTotal <= 0}
            onPress={() => onTransport(stats.area.id)}
            data-testid={`mci-area-transport-${name}`}
          >
            {t('Transport')}
          </Button>
        )}
      </div>
    </section>
  );
}
