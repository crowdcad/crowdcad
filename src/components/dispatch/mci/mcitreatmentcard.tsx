'use client';

import React, { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { Button, Card, CardBody, CardHeader } from '@heroui/react';
import type { MciAreaStats, MciTransportTrip } from '@/lib/mci';
import { MCI_COLORS } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import DispatchMotionCell from '@/components/dispatch/motioncell';
import { MciColorDot, MciCountsLine, MciTeamChips, formatClock } from './mciparts';

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

/**
 * A treatment location as a row that opens like a call or clinic row: name, map, tag colors and the
 * Transport button stay in the header; the open row adds the received/transported counts, teams and a
 * scrollable transport log.
 */
export default function MciTreatmentCard({ stats, teams, trips, readOnly, onTransport, mapEnabled = false, hasShape = false, onDraw }: Props) {
  const { t } = useDispatchTerms();
  const [expanded, setExpanded] = useState(false);
  const { name, isClinic, regular, inTreatment, inTreatmentTotal, transportedTotal, receivedTotal } = stats;

  return (
    <Card
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'}`}
      aria-label={`${name} treatment location`}
      data-testid={`mci-area-${name}`}
    >
      <CardHeader
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[15px] font-semibold text-surface-light sm:text-base">{name}</div>
          {isClinic && <span className="shrink-0 rounded-md border border-status-card-ring-blue bg-status-card-blue px-2 py-0.5 text-xs text-surface-light">Clinic</span>}
          {mapEnabled && !isClinic && onDraw && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDraw(stats.area.id);
              }}
              aria-label={`${hasShape ? 'Edit' : 'Draw'} ${name} on the map`}
              title={hasShape ? 'Edit on the map' : 'Draw on the map'}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-surface-liner ${hasShape ? 'text-surface-faint' : 'text-status-orange'}`}
              data-testid={`mci-area-draw-${name}`}
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="box-content flex h-6 shrink-0 items-center gap-3 text-sm text-surface-light">
          <span className="inline-flex items-center gap-2 tabular-nums" data-testid={`mci-area-counts-${name}`}>
            {MCI_COLORS.map((color) => (
              <span key={color} className="inline-flex items-center gap-1" aria-label={`${inTreatment[color]} ${color}`}>
                <MciColorDot color={color} />
                {inTreatment[color]}
              </span>
            ))}
          </span>
          <span className="font-semibold tabular-nums" data-testid={`mci-area-combined-${name}`}>
            {isClinic ? `${regular} regular + ${inTreatmentTotal} MCI` : `${inTreatmentTotal} MCI`}
          </span>
          {!readOnly && (
            <Button
              size="sm"
              radius="lg"
              className="h-6 min-w-0 shrink-0 bg-accent px-2 text-xs text-surface-light"
              isDisabled={inTreatmentTotal <= 0}
              onClick={(e) => e.stopPropagation()}
              onPress={() => onTransport(stats.area.id)}
              data-testid={`mci-area-transport-${name}`}
            >
              {t('Transport')}
            </Button>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </div>
      </CardHeader>

      <CardBody className="p-0">
        <DispatchMotionCell isOpen={expanded} animate overflowVisibleWhenOpen>
          <div className="mx-4 mb-3 flex flex-col gap-3 border-t border-surface-liner pt-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1 text-xs text-surface-faint" data-testid={`mci-area-transported-${name}`}>
              <span>
                Received {receivedTotal}. Transported {transportedTotal}.
              </span>
              {transportedTotal > 0 && <MciCountsLine counts={stats.transported} />}
            </div>

            <MciTeamChips names={teams} emptyText="No teams in treatment" />

            <div data-testid={`mci-area-transport-log-${name}`}>
              <div className="mb-1 text-xs font-bold text-surface-light">
                {t('Transport')} log ({trips.length})
              </div>
              {trips.length === 0 ? (
                <p className="text-xs italic text-surface-faint">No transports yet.</p>
              ) : (
                <ul className="minimal-scrollbar flex max-h-44 flex-col divide-y divide-surface-liner overflow-y-auto">
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
          </div>
        </DispatchMotionCell>
      </CardBody>
    </Card>
  );
}
