'use client';

import React, { useMemo } from 'react';
import type { Event } from '@/app/types';
import { MCI_COLORS, deriveMci } from '@/lib/mci';
import { GRID_CELL, GRID_WRAPPER } from '@/app/(main)/events/[eventId]/summary/summaryGrid';
import { MCI_COLOR_STYLES, MciColorDot, formatElapsed } from './mciparts';

type Props = {
  event: Event;
  formatTimestamp: (ms: number) => string;
};

/** The post-event MCI record: periods, patients per zone by color, patients received per treatment location, and each patient seen in treatment. */
export default function MciSummary({ event, formatTimestamp }: Props) {
  const derived = useMemo(() => deriveMci(event), [event]);
  const mci = event.mci;
  if (!mci || mci.periods.length === 0) return null;
  const zoneNames = new Map(mci.zones.map((z) => [z.id, z.name]));
  const areaNames = new Map(derived.areas.map((a) => [a.area.id, a.name]));

  return (
    <div className={`grid grid-cols-1 ${GRID_WRAPPER}`} data-testid="mci-summary">
      <div className={`${GRID_CELL} p-6`}>
        <h2 className="mb-3 text-xl font-semibold">MCI</h2>

        <h3 className="mb-1 text-sm font-semibold text-surface-faint">Periods</h3>
        <ul className="mb-5 space-y-1 text-sm" data-testid="mci-summary-periods">
          {mci.periods.map((period, i) => (
            <li key={i}>
              <span className="font-semibold">{formatTimestamp(period.startedAt)}</span>
              {' to '}
              {period.endedAt ? formatTimestamp(period.endedAt) : 'still active'}
              <span className="text-surface-faint">
                {' '}({formatElapsed(((period.endedAt ?? Date.now()) - period.startedAt) / 1000)}
                {period.endedAt ? '' : ' so far'})
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mb-1 text-sm font-semibold text-surface-faint">Zones</h3>
        <div className="minimal-scrollbar mb-5 overflow-x-auto">
          <table className="w-full text-sm" data-testid="mci-summary-zones">
            <thead>
              <tr className="text-left text-surface-faint">
                <th className="py-1 pr-4 font-normal">Zone</th>
                {MCI_COLORS.map((color) => (
                  <th key={color} className="px-2 text-center font-normal">
                    <span className="inline-flex items-center gap-1"><MciColorDot color={color} />{MCI_COLOR_STYLES[color].label}</span>
                  </th>
                ))}
                <th className="px-2 text-center font-normal">Tagged</th>
                <th className="px-2 text-center font-normal">Moved</th>
                <th className="px-2 text-center font-normal">Still in zone</th>
                <th className="pl-4 font-normal">Cleared</th>
              </tr>
            </thead>
            <tbody>
              {derived.zones.map((z) => (
                <tr key={z.zone.id} className="border-t border-surface-liner/70">
                  <td className="py-1 pr-4 font-semibold">{z.zone.name}</td>
                  {MCI_COLORS.map((color) => (
                    <td key={color} className="px-2 text-center tabular-nums">{z.tagged[color]}</td>
                  ))}
                  <td className="px-2 text-center font-semibold tabular-nums">{z.taggedTotal}</td>
                  <td className="px-2 text-center tabular-nums">{z.movedTotal}</td>
                  <td className="px-2 text-center tabular-nums">{z.inZoneTotal}</td>
                  <td className="pl-4">{z.clearedTimes.length ? z.clearedTimes.map(formatTimestamp).join(', ') : 'Not cleared'}</td>
                </tr>
              ))}
              {derived.zones.length === 0 && (
                <tr><td colSpan={9} className="py-2 italic text-surface-faint">No zones</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 text-sm font-semibold text-surface-faint">Treatment locations</h3>
        <div className="minimal-scrollbar overflow-x-auto">
          <table className="w-full text-sm" data-testid="mci-summary-areas">
            <thead>
              <tr className="text-left text-surface-faint">
                <th className="py-1 pr-4 font-normal">Location</th>
                {MCI_COLORS.map((color) => (
                  <th key={color} className="px-2 text-center font-normal">
                    <span className="inline-flex items-center gap-1"><MciColorDot color={color} />{MCI_COLOR_STYLES[color].label}</span>
                  </th>
                ))}
                <th className="px-2 text-center font-normal">MCI patients received</th>
                <th className="px-2 text-center font-normal">Transported</th>
                <th className="px-2 text-center font-normal">Still here</th>
              </tr>
            </thead>
            <tbody>
              {derived.areas.map((a) => (
                <tr key={a.area.id} className="border-t border-surface-liner/70">
                  <td className="py-1 pr-4 font-semibold">{a.name}</td>
                  {MCI_COLORS.map((color) => (
                    <td key={color} className="px-2 text-center tabular-nums">{a.received[color]}</td>
                  ))}
                  <td className="px-2 text-center font-semibold tabular-nums">{a.receivedTotal}</td>
                  <td className="px-2 text-center tabular-nums">{a.transportedTotal}</td>
                  <td className="px-2 text-center tabular-nums">{a.inTreatmentTotal}</td>
                </tr>
              ))}
              {derived.areas.length === 0 && (
                <tr><td colSpan={8} className="py-2 italic text-surface-faint">No treatment locations</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {derived.patients.length > 0 && (
          <>
            <h3 className="mb-1 mt-5 text-sm font-semibold text-surface-faint">Patients in treatment</h3>
            <div className="minimal-scrollbar overflow-x-auto">
              <table className="w-full text-sm" data-testid="mci-summary-patients">
                <thead>
                  <tr className="text-left text-surface-faint">
                    <th className="py-1 pr-3 font-normal">Tag</th>
                    <th className="px-2 font-normal">Age</th>
                    <th className="px-2 font-normal">Sex</th>
                    <th className="px-2 font-normal">Chief complaint</th>
                    <th className="px-2 font-normal">From</th>
                    <th className="px-2 font-normal">Team</th>
                    <th className="px-2 font-normal">Location</th>
                    <th className="px-2 font-normal">Arrived</th>
                    <th className="px-2 font-normal">Transported</th>
                    <th className="px-2 text-right font-normal">Minutes in treatment</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.patients.map((p) => (
                    <tr key={p.id} className="border-t border-surface-liner/70">
                      <td className="py-1 pr-3">
                        <span className="inline-flex items-center gap-1"><MciColorDot color={p.color} />{MCI_COLOR_STYLES[p.color].label}</span>
                      </td>
                      <td className="px-2 tabular-nums">{p.details.age ?? ''}</td>
                      <td className="px-2">{p.details.sex ?? ''}</td>
                      <td className="px-2">{p.details.complaint ?? ''}</td>
                      <td className="px-2">{p.fromZoneId ? zoneNames.get(p.fromZoneId) ?? '' : 'Walk-in'}</td>
                      <td className="px-2">{p.details.team ?? ''}</td>
                      <td className="px-2">{areaNames.get(p.areaId) ?? ''}</td>
                      <td className="px-2 tabular-nums">{formatTimestamp(p.arrivedAt)}</td>
                      <td className="px-2">
                        {p.transportedAt !== undefined
                          ? `${formatTimestamp(p.transportedAt)}${p.unit ? `, ${p.unit}` : ''}${p.destination ? ` to ${p.destination}` : ''}`
                          : 'Still in treatment'}
                      </td>
                      <td className="px-2 text-right tabular-nums">
                        {Math.round((((p.transportedAt ?? mci.periods[mci.periods.length - 1]?.endedAt) ?? Date.now()) - p.arrivedAt) / 60000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
