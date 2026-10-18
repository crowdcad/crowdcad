'use client';

import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart, BarChart, Bar, LineChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { STATUS_COLORS_HEX } from '@/lib/colorTokens';
import type { TeamStatusBreakdown, AvailabilityPoint } from '@/lib/analyticsUtils';
import type { MciSeriesPoint } from '@/lib/mci';
import { GRID_WRAPPER, GRID_CELL } from './summaryGrid';

type Interaction = { sessionId: string; startTime: string; duration: number; clicks: number; keystrokes: number };

// Recharts' Tooltip defaults to a white content box, unreadable against
// this app's dark theme — everything else on these charts stays default,
// but the tooltip needs at least a themed background/text to be legible.
const TOOLTIP_CONTENT_STYLE = {
  background: 'hsl(var(--surface-bg-0))',
  border: '1px solid hsl(var(--surface-border))',
  borderRadius: 8,
};
const TOOLTIP_LABEL_STYLE = { color: 'hsl(var(--surface-text-strong))' };
const TOOLTIP_ITEM_STYLE = { color: 'hsl(var(--surface-text-strong))' };

export default function SummaryCharts({
  teamStatusBreakdown = [] as TeamStatusBreakdown[],
  availabilitySeries = [] as AvailabilityPoint[],
  interactionTimeline = [] as Interaction[],
  mciSeries,
}: {
  teamStatusBreakdown?: TeamStatusBreakdown[];
  availabilitySeries?: AvailabilityPoint[];
  interactionTimeline?: Interaction[];
  /** Patients in zones and in treatment over time; present when the event had an MCI. */
  mciSeries?: MciSeriesPoint[];
}) {
  return (
    <>
      <div className={GRID_WRAPPER}>
        <div className={`${GRID_CELL} p-6`}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-semibold">Total Team Availability</h2>
            {availabilitySeries.some((p) => p.surging) && (
              <span className="inline-flex items-center gap-1.5 text-xs text-surface-faint">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_COLORS_HEX.alarm, opacity: 0.35 }} />
                Surge active
              </span>
            )}
          </div>
          <div className="w-full h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* One bar per 10 minutes of the event (see teamAvailabilitySeries).
                  The Area (drawn first, so it sits behind the Bar) shades the
                  full column height orange for any bucket that overlapped an
                  active surge — interval={5} skips 5 of every 6 x-axis ticks
                  so it still only labels the top of each hour. */}
              <ComposedChart data={availabilitySeries} margin={{ top: 8, right: 16, left: 12, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={5} />
                <YAxis allowDecimals={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  formatter={(value, name) => {
                    if (name === 'Surge active') {
                      return [value ? 'Yes' : 'No', name];
                    }
                    const normalized = Array.isArray(value) ? value[0] : value;
                    return [`${Number(normalized ?? 0)}%`, 'Avg. teams available'];
                  }}
                />
                <Area
                  dataKey={(point: { surging?: boolean }) => (point.surging ? 100 : 0)}
                  name="Surge active"
                  type="step"
                  stroke="none"
                  fill={STATUS_COLORS_HEX.alarm}
                  fillOpacity={0.35}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Bar dataKey="availability" name="Teams available" fill={STATUS_COLORS_HEX.green} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${GRID_CELL} p-6`}>
          <h2 className="text-xl font-semibold mb-4">Team Status Breakdown</h2>
          <div className="w-full h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={teamStatusBreakdown} margin={{ top: 8, right: 16, left: 12, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="team" />
                <YAxis yAxisId="pct" allowDecimals={false} unit="%" domain={[0, 100]} />
                <YAxis yAxisId="calls" orientation="right" allowDecimals={false} />
                {/* No itemStyle color override here (unlike the other
                    tooltips) — Recharts colors each row by its series'
                    own fill/stroke by default, so leaving it unset makes
                    each status's tooltip text match its bar color. */}
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value, name, entry) =>
                    entry?.dataKey === 'calls' ? [value, name] : [`${value}%`, name]
                  }
                />
                <Legend />
                <Bar yAxisId="pct" stackId="status" dataKey="available" name="Available" fill={STATUS_COLORS_HEX.green} isAnimationActive={false} />
                <Bar yAxisId="pct" stackId="status" dataKey="onBreak" name="On Break" fill={STATUS_COLORS_HEX.blue} isAnimationActive={false} />
                <Bar yAxisId="pct" stackId="status" dataKey="inClinic" name="In Clinic" fill={STATUS_COLORS_HEX.orange} isAnimationActive={false} />
                <Bar yAxisId="pct" stackId="status" dataKey="onCalls" name="On Calls" fill={STATUS_COLORS_HEX.red} isAnimationActive={false} />
                <Line yAxisId="calls" dataKey="calls" name="Calls attached" stroke="currentColor" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {mciSeries && mciSeries.length > 0 && (
        <div className={GRID_WRAPPER}>
          <div className={`${GRID_CELL} p-6`} data-testid="mci-chart">
            <h2 className="text-xl font-semibold mb-4">MCI Patients Over Time</h2>
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                {/* Step chart from the MCI log: each entry changes the count at its own time and holds until the next. */}
                <LineChart data={mciSeries} margin={{ top: 8, right: 16, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    labelFormatter={(t) => new Date(Number(t)).toLocaleTimeString()}
                  />
                  <Legend />
                  <Line type="stepAfter" dataKey="inZones" name="In zones" stroke={STATUS_COLORS_HEX.red} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="inTreatment" name="In treatment (MCI)" stroke={STATUS_COLORS_HEX.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="transported" name="Transported so far" stroke={STATUS_COLORS_HEX.green} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {interactionTimeline && interactionTimeline.length > 0 && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 ${GRID_WRAPPER}`}>
          <div className={`${GRID_CELL} p-6`}>
            <h2 className="text-xl font-semibold mb-4">Session Activity</h2>
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={interactionTimeline} margin={{ top: 8, right: 16, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sessionId" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Legend />
                  <Bar dataKey="clicks" name="Mouse Clicks" fill="#8884d8" isAnimationActive={false} />
                  <Bar dataKey="keystrokes" name="Keystrokes" fill="#82ca9d" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${GRID_CELL} p-6`}>
            <h2 className="text-xl font-semibold mb-4">Session Durations</h2>
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={interactionTimeline} margin={{ top: 8, right: 16, left: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="startTime" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(value) => {
                      const normalized = Array.isArray(value) ? value[0] : value;
                      return [`${Number(normalized ?? 0).toFixed(1)} min`, 'Duration'];
                    }}
                  />
                  <Line type="monotone" dataKey="duration" name="Duration" stroke="#8884d8" strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
