'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin, Plus } from 'lucide-react';
import { Button, Card, CardBody, CardHeader } from '@heroui/react';
import type { MciColor } from '@/app/types';
import type { MciAreaStats, MciPatient, MciPatientField, MciTransportTrip } from '@/lib/mci';
import { MCI_COLORS, mciPatientLabel } from '@/lib/mci';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import DispatchMotionCell from '@/components/dispatch/motioncell';
import { MCI_COLOR_STYLES, MciColorDot, MciCountsLine, MciTeamChips, formatClock } from './mciparts';
import MciPatientBox, { MCI_PATIENT_DRAG_TYPE, type MciReassignTarget } from './mcipatientbox';

/** The colors that get a column of patient boxes. Black stays counts-only (D11). */
const PATIENT_COLUMNS: readonly MciColor[] = ['red', 'yellow', 'green'];

/** What the patient boxes need from the tab. */
export type MciPatientHandlers = {
  zoneNames: Record<string, string>;
  /** Teams for a patient's Team field, those that worked `zoneId` first. */
  teamSuggestions: (zoneId?: string) => string[];
  unitSuggestions: string[];
  areas: { id: string; name: string }[];
  onDetails: (patientId: string, fields: Partial<Record<MciPatientField, string>>) => void;
  onPriority: (patientId: string, rank: number | null) => void;
  onTransportPatient: (patientId: string, trip: { unit?: string; destination?: string }) => void | Promise<unknown>;
  /** Opens the note dialog for a retriage or move (from the menu or a drop). */
  onReassign: (patient: MciPatient, target: MciReassignTarget) => void;
  /** A box dropped on a column or a location: the tab finds the patient and asks for the note. */
  onDropPatient: (patientId: string, target: MciReassignTarget) => void;
  onArrive: (areaId: string, color: MciColor) => void;
};

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
  /** Set when the MCI tracks patients: the open row shows a column of boxes per color. */
  patients?: MciPatientHandlers;
};

const hasPatientDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(MCI_PATIENT_DRAG_TYPE);

/** One color's column: a header with the count and the walk-in button, then a box per patient. A box dropped here takes this color and location. */
function PatientColumn({ areaId, color, patients, readOnly, handlers }: { areaId: string; color: MciColor; patients: MciPatient[]; readOnly: boolean; handlers: MciPatientHandlers }) {
  const [over, setOver] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // After a walk-in is added, its box (the last, having no priority) takes focus for typing.
  const focusNewest = useRef(false);
  const count = patients.length;
  const previousCount = useRef(count);
  useEffect(() => {
    if (focusNewest.current && count > previousCount.current) {
      focusNewest.current = false;
      const boxes = listRef.current?.querySelectorAll<HTMLElement>('[data-mci-patient]');
      boxes?.[boxes.length - 1]?.querySelector<HTMLInputElement>('[data-mci-field="age"]')?.focus();
    }
    previousCount.current = count;
  }, [count]);

  const style = MCI_COLOR_STYLES[color];
  return (
    <div
      onDragOver={(e) => {
        if (readOnly || !hasPatientDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData(MCI_PATIENT_DRAG_TYPE);
        if (readOnly || !id) return;
        e.preventDefault();
        e.stopPropagation();
        handlers.onDropPatient(id, { areaId, color });
      }}
      className={`flex min-w-0 flex-col gap-1.5 rounded-md p-1.5 transition-colors ${over ? 'bg-surface-liner/60 ring-1 ring-surface-faint' : 'bg-surface-liner/20'}`}
      data-testid={`mci-patient-column-${color}`}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase ${style.textClass}`}>
          <MciColorDot color={color} />
          {style.label}
          <span className="tabular-nums text-surface-light">{count}</span>
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              focusNewest.current = true;
              handlers.onArrive(areaId, color);
            }}
            aria-label={`Add a ${style.label.toLowerCase()} walk-in`}
            title="Add a patient who did not come through a zone"
            className="flex h-5 items-center gap-0.5 rounded-md px-1 text-[11px] text-surface-faint hover:bg-surface-liner hover:text-surface-light"
            data-testid={`mci-patient-add-${color}`}
          >
            <Plus className="h-3 w-3" />
            Walk-in
          </button>
        )}
      </div>
      <div ref={listRef} className="flex flex-col gap-1">
        {patients.map((p) => (
          <MciPatientBox
            key={p.id}
            patient={p}
            zoneName={p.fromZoneId ? handlers.zoneNames[p.fromZoneId] : undefined}
            readOnly={readOnly}
            teamSuggestions={handlers.teamSuggestions(p.fromZoneId)}
            unitSuggestions={handlers.unitSuggestions}
            areas={handlers.areas}
            onDetails={handlers.onDetails}
            onPriority={handlers.onPriority}
            onTransport={handlers.onTransportPatient}
            onReassign={handlers.onReassign}
          />
        ))}
        {count === 0 && <p className="px-0.5 py-1 text-xs italic text-surface-faint">No patients</p>}
      </div>
    </div>
  );
}

/**
 * A treatment location as a row that opens like a call or clinic row: name, map, tag colors and the
 * Transport button stay in the header; the open row adds the patient columns (when patients are tracked),
 * the received/transported counts, teams and a scrollable transport log.
 */
export default function MciTreatmentCard({ stats, teams, trips, readOnly, onTransport, mapEnabled = false, hasShape = false, onDraw, patients }: Props) {
  const { t } = useDispatchTerms();
  const { name, isClinic, regular, inTreatment, inTreatmentTotal, transportedTotal, receivedTotal, transferredOutTotal } = stats;
  const tracking = !!patients;
  // A tracked location with patients opens, so the treatment leader sees the boxes; one that gets its first patient opens too.
  const [expanded, setExpanded] = useState(() => tracking && inTreatmentTotal > 0);
  const previousTotal = useRef(inTreatmentTotal);
  useEffect(() => {
    if (tracking && previousTotal.current === 0 && inTreatmentTotal > 0) setExpanded(true);
    previousTotal.current = inTreatmentTotal;
  }, [tracking, inTreatmentTotal]);
  const [dropOver, setDropOver] = useState(false);
  const blackHere = inTreatment.black;

  return (
    <Card
      className={`dispatch-shell-card ${expanded ? 'dispatch-shell-card--open' : ''} w-full border-0 transition-colors duration-200 ${expanded ? 'rounded-lg bg-surface-deep shadow-sm' : 'rounded-none bg-transparent shadow-none hover:bg-surface-deep'} ${dropOver ? 'ring-1 ring-surface-faint' : ''}`}
      aria-label={`${name} treatment location`}
      data-testid={`mci-area-${name}`}
      // Dropping a box anywhere on the row outside a column moves the patient here and keeps their color.
      onDragOver={(e: React.DragEvent) => {
        if (!patients || readOnly || !hasPatientDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropOver(true);
      }}
      onDragLeave={(e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false);
      }}
      onDrop={(e: React.DragEvent) => {
        setDropOver(false);
        const id = e.dataTransfer.getData(MCI_PATIENT_DRAG_TYPE);
        if (!patients || readOnly || !id) return;
        e.preventDefault();
        patients.onDropPatient(id, { areaId: stats.area.id });
      }}
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
            {patients && (
              <div className="flex flex-col gap-1" data-testid={`mci-area-patients-${name}`}>
                {/* Columns sit side by side once each has room for a box, else they stack. */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-2">
                  {PATIENT_COLUMNS.map((color) => (
                    <PatientColumn
                      key={color}
                      areaId={stats.area.id}
                      color={color}
                      patients={stats.patients.filter((p) => p.color === color)}
                      readOnly={readOnly}
                      handlers={patients}
                    />
                  ))}
                </div>
                {blackHere > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-surface-faint">
                    <MciColorDot color="black" />
                    {blackHere} black here (counts only)
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 text-xs text-surface-faint" data-testid={`mci-area-transported-${name}`}>
              <span>
                Received {receivedTotal}. Transported {transportedTotal}.{transferredOutTotal > 0 ? ` Moved to another location ${transferredOutTotal}.` : ''}
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
                        <span className="font-semibold">{trip.unit || 'No ambulance number'}</span>
                        {trip.destination ? ` to ${trip.destination}` : ''}
                      </span>
                      <MciCountsLine counts={trip.counts} />
                      {trip.patients.length > 0 && (
                        <span className="text-surface-faint">{trip.patients.map((p) => mciPatientLabel(p.details) || `1 ${p.color}`).join('; ')}</span>
                      )}
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
