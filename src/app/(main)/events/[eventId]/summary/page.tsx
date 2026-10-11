"use client";

import { useEffect, useState, useMemo } from 'react';
import { formatEventDate } from '@/lib/eventDate';
import { useParams } from 'next/navigation';
import { dbService } from '@/lib/services';
import { Event, Call, TeamLogEntry, CallLogEntry, InteractionSession } from '@/app/types';
import dynamic from 'next/dynamic';
import { Button } from '@heroui/react';
import { getScheduleWindow, teamStatusBreakdown, teamAvailabilitySeries, getSurgeIntervals } from '@/lib/analyticsUtils';
import { getZoneCallSummaries } from '@/lib/zones';
import { formatLogTimestampForCsv } from '@/lib/csvFormat';
import { GRID_WRAPPER, GRID_CELL } from './summaryGrid';
import LoadingScreen from '@/components/ui/loading-screen';
import ExportLogModal from '@/components/modals/event/exportlogmodal';

const SummaryCharts = dynamic(() => import('./SummaryCharts'), { ssr: false, loading: () => <div className="p-6 bg-surface-deep border border-surface-liner">Loading charts...</div> });

const TWO_HOURS = 2 * 60 * 60 * 1000;

export default function SummaryPage() {
  const params = useParams();
  const { eventId } = params as { eventId?: string };

  const [openStaff, setOpenStaff] = useState(false);
  const [openCalls,  setOpenCalls]  = useState(false);
  const [openSurge, setOpenSurge] = useState(false);
  const [event, setEvent]         = useState<Event | null>(null);
  const [openDataCollection, setOpenDataCollection] = useState(false);
  const [showExportLogModal, setShowExportLogModal] = useState(false);


  useEffect(() => {
    const fetchData = async () => {
      if (!eventId) return;
      const eventDoc = await dbService.getDocument<Event>('events', eventId);
      setEvent(eventDoc.exists ? eventDoc.data : null);
    };
    fetchData();
  }, [eventId]);

  // Keep hooks stable even before `event` is loaded by declaring
  // memoized values with guards here. This prevents conditional
  // hook usage and preserves hook order across renders.
  const scheduleWindow = useMemo(() => {
    if (!event) {
      const now = Date.now();
      return { start: now - TWO_HOURS, end: now + 4 * 60 * 60 * 1000 };
    }
    return getScheduleWindow(event);
  }, [event]);

  const teamBreakdown = useMemo(() => {
    if (!event) return [];
    return teamStatusBreakdown(event, scheduleWindow.start, scheduleWindow.end);
  }, [event, scheduleWindow.start, scheduleWindow.end]);

  const surgeIntervals = useMemo(() => {
    if (!event) return [];
    return getSurgeIntervals(event, scheduleWindow.end);
  }, [event, scheduleWindow.end]);

  const availabilitySeries = useMemo(() => {
    if (!event) return [];
    return teamAvailabilitySeries(event, scheduleWindow.start, scheduleWindow.end, surgeIntervals);
  }, [event, scheduleWindow.start, scheduleWindow.end, surgeIntervals]);

  const interactionSessions = useMemo<InteractionSession[]>(() => event?.interactionSessions || [], [event?.interactionSessions]);

  const zoneCallSummaries = useMemo(() => getZoneCallSummaries(event), [event]);

  const interactionTimeline = useMemo(() => interactionSessions.map(session => ({
    sessionId: session.sessionId,
    startTime: new Date(session.startTime).toLocaleTimeString(),
    duration: ((session.endTime || Date.now()) - session.startTime) / 1000 / 60, // minutes
    clicks: session.mouseClicks.length,
    keystrokes: session.keyStrokes.length,
  })), [interactionSessions]);

  if (!event) {
    return <LoadingScreen label="Loading summary…" />;
  }

  // Delivered to Clinic (robust: use status OR clinic flag)
  const totalDeliveredToClinic =
    event.calls.filter(c => c.status === 'Delivered' || c.clinic === true).length;

  // "Transports" counts both a clinic patient transferred to an ambulance
  // (outcome === 'Transported') and a call resolved directly to an ambulance
  // from the scene ("Transferred to" in the call tracker, stored internally
  // as status/reason 'Rolled from Scene'). A call resolved this way ends up
  // with call.status === 'Resolved' (the generic terminal status every
  // non-Delivered/Refusal/NMM/Unable-to-Locate resolution collapses to), so
  // the acting team's detachedTeams reason — which does preserve the
  // original 'Rolled from Scene' value — is what actually identifies it.
  // 'Rolled from Clinic' is kept for legacy data — the outcome dropdown no
  // longer offers it.
  const totalTransports =
    event.calls.filter(c =>
      c.outcome === 'Transported' ||
      c.outcome === 'Rolled from Clinic' ||
      c.status === 'Rolled from Scene' ||
      c.detachedTeams?.some(dt => dt.reason === 'Rolled from Scene')
    ).length;

  const formatTimestamp = (timestamp: number) => {
    return formatLogTimestampForCsv(timestamp);
  };

  // Utility to generate full log text for CSV
  const generateCSVData = () => {
    if (!event) return '';

    const csvRows: string[] = [];

    // Headers
    csvRows.push('Log Type,Team/Call ID,Timestamp,Message');

    // Staff Logs
    event.staff.forEach((team) => {
      (team.log || []).forEach((entry: TeamLogEntry) => {
        csvRows.push(`Staff,${team.team},${formatTimestamp(entry.timestamp)},"${entry.message}"`);
      });
    });

    // Call Logs
    event.calls.forEach((call) => {
      (call.log || []).forEach((entry: CallLogEntry) => {
        csvRows.push(`Call,${call.id},${formatTimestamp(entry.timestamp)},"${entry.message}"`);
      });
    });

    // Surge Log
    (event.surgeLog || []).forEach((period) => {
      csvRows.push(`Surge,-,${formatTimestamp(period.startedAt)},"Surge activated"`);
      if (period.endedAt) {
        const minutes = Math.round((period.endedAt - period.startedAt) / 60000);
        csvRows.push(`Surge,-,${formatTimestamp(period.endedAt)},"Surge deactivated (active for ${minutes} min)"`);
      }
    });

    // Zone Summary
    zoneCallSummaries.forEach((zone) => {
      csvRows.push(`Zone,${zone.zoneName},-,"${zone.totalCalls} calls, ${zone.deliveredToClinic} delivered to clinic, ${zone.transports} transports"`);
    });

    return csvRows.join('\n');
  };

  const handleCSVDownload = () => {
    const csvContent = generateCSVData();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', `${event?.name || eventId}_Summary.csv`);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDataCollectionCSVDownload = () => {
    const csvContent = generateDataCollectionCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', `${event?.name || eventId}_TestingData.csv`);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const generateDataCollectionCSV = () => {
    if (!event || !interactionSessions.length) return '';

    const csvRows: string[] = [];

    // Find the earliest session start time to use as reference point
    const sessionStartTimestamp = Math.min(...interactionSessions.map(s => s.startTime));

    // Convert timestamp to seconds after session start
    const convertTimestamp = (timestamp: number) => {
      const elapsedMs = timestamp - sessionStartTimestamp;
      return (elapsedMs / 1000).toFixed(2);
    };

    // Headers for interaction data
    csvRows.push('Session ID,Event ID,Session Start,Session End,Duration (ms),Mouse Clicks,Key Strokes,Clicks Per Minute,Keys Per Minute');

    interactionSessions.forEach(session => {
      const duration = (session.endTime || Date.now()) - session.startTime;
      const durationMinutes = duration / (1000 * 60);
      const clicksPerMinute = durationMinutes > 0 ? (session.mouseClicks.length / durationMinutes).toFixed(2) : '0';
      const keysPerMinute = durationMinutes > 0 ? (session.keyStrokes.length / durationMinutes).toFixed(2) : '0';

      csvRows.push([
        session.sessionId,
        session.eventId,
        convertTimestamp(session.startTime),
        session.endTime ? convertTimestamp(session.endTime) : 'Ongoing',
        duration.toString(),
        session.mouseClicks.length.toString(),
        session.keyStrokes.length.toString(),
        clicksPerMinute,
        keysPerMinute
      ].map(field => `"${field}"`).join(','));
    });

    // Add detailed click data with proper headers
    csvRows.push(''); // Empty line separator
    csvRows.push('Detailed Mouse Clicks:');
    csvRows.push('Session ID,Timestamp');

    interactionSessions.forEach(session => {
      session.mouseClicks.forEach(click => {
        csvRows.push([
          session.sessionId,
          convertTimestamp(click.timestamp)
        ].map(field => `"${field}"`).join(','));
      });
    });

    // Add detailed keystroke data with proper headers
    csvRows.push(''); // Empty line separator
    csvRows.push('Detailed Key Strokes:');
    csvRows.push('Session ID,Timestamp');

    interactionSessions.forEach(session => {
      session.keyStrokes.forEach(stroke => {
        csvRows.push([
          session.sessionId,
          convertTimestamp(stroke.timestamp)
        ].map(field => `"${field}"`).join(','));
      });
    });

    return csvRows.join('\n');
  };

  // Data collection analytics
  const totalSessions = interactionSessions.length;
  const surgeLog = event.surgeLog || [];
  const totalMouseClicks = interactionSessions.reduce((sum, session) => sum + session.mouseClicks.length, 0);
  const totalKeyStrokes = interactionSessions.reduce((sum, session) => sum + session.keyStrokes.length, 0);
  const avgSessionDuration = totalSessions > 0
    ? interactionSessions.reduce((sum, session) => {
        const duration = (session.endTime || Date.now()) - session.startTime;
        return sum + duration;
      }, 0) / totalSessions / 1000 / 60 // Convert to minutes
    : 0;

  const totalCalls = event.calls?.length ?? 0;

  // Create chronological call numbers based on first log entry time
  const getChronologicalCallNumber = (call: Call) => {
    const sortedCalls = [...(event.calls || [])].sort((a, b) => {
      const aFirstTs = (a.log || []).reduce<number | null>((min, e) => {
        if (typeof e.timestamp !== 'number') return min;
        return min == null ? e.timestamp : Math.min(min, e.timestamp);
      }, null) || 0;
      const bFirstTs = (b.log || []).reduce<number | null>((min, e) => {
        if (typeof e.timestamp !== 'number') return min;
        return min == null ? e.timestamp : Math.min(min, e.timestamp);
      }, null) || 0;
      return aFirstTs - bFirstTs;
    });
    return sortedCalls.findIndex(c => c.id === call.id) + 1;
  };

  return (
    <main className="relative min-h-screen bg-surface-deepest text-surface-light scroll-smooth">
      <div className="relative z-10 px-6 md:px-20 py-8">
        <div className="max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h1 className="text-3xl md:text-4xl font-bold">
              Event Summary: {event.name}{' '}
              <span className="font-normal text-surface-light/70 text-xl md:text-2xl">
                ({formatEventDate(event.date)})
              </span>
            </h1>
            <div className="flex gap-2 shrink-0">
              <Button
                onPress={handleCSVDownload}
                variant="flat"
                radius="lg"
                className="px-4 py-2 bg-accent hover:bg-accent/90 text-surface-light font-semibold"
              >
                Export Logs
              </Button>
              <Button
                onPress={() => setShowExportLogModal(true)}
                variant="flat"
                radius="lg"
                className="px-4 py-2 hover:bg-surface-liner text-surface-light font-semibold"
              >
                Export Anonymized Report
              </Button>
              {totalSessions > 0 && (
                <Button
                  onPress={handleDataCollectionCSVDownload}
                  variant="flat"
                  radius="lg"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-surface-light font-semibold"
                >
                  Export Testing Data
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* BIG totals */}
        <div className={`grid grid-cols-1 sm:grid-cols-3 ${GRID_WRAPPER}`}>
          <div className={`${GRID_CELL} p-6`}>
            <div className="text-sm opacity-70">Total Calls</div>
            <div className="text-6xl md:text-7xl font-extrabold leading-none mt-1">{totalCalls}</div>
          </div>

          <div className={`${GRID_CELL} p-6`}>
            <div className="text-sm opacity-70">Delivered to Clinic</div>
            <div className="text-6xl md:text-7xl font-extrabold leading-none mt-1">{totalDeliveredToClinic}</div>
          </div>

          <div className={`${GRID_CELL} p-6`}>
            <div className="text-sm opacity-70">Transports</div>
            <div className="text-6xl md:text-7xl font-extrabold leading-none mt-1">{totalTransports}</div>
          </div>
        </div>

        {zoneCallSummaries.length > 0 && (
          <div className={GRID_CELL}>
            <div className="px-4 py-3">
              <span className="font-semibold">Zone Breakdown</span>
              <div className="text-sm text-surface-faint">{zoneCallSummaries.length} dispatch zone{zoneCallSummaries.length === 1 ? '' : 's'}</div>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {zoneCallSummaries.map((zone) => (
                <div key={zone.zoneId} className="bg-surface-deepest p-3 flex items-center justify-between">
                  <span className="font-semibold">{zone.zoneName}</span>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-surface-faint">Calls: </span>
                      <span className="font-semibold">{zone.totalCalls}</span>
                    </div>
                    <div>
                      <span className="text-surface-faint">Delivered to Clinic: </span>
                      <span className="font-semibold">{zone.deliveredToClinic}</span>
                    </div>
                    <div>
                      <span className="text-surface-faint">Transports: </span>
                      <span className="font-semibold">{zone.transports}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <SummaryCharts
          teamStatusBreakdown={teamBreakdown}
          availabilitySeries={availabilitySeries}
          interactionTimeline={interactionTimeline}
        />

        {totalSessions > 0 && (
          <div className={`grid grid-cols-1 sm:grid-cols-4 ${GRID_WRAPPER}`}>
            <div className={`${GRID_CELL} p-6`}>
              <div className="text-sm opacity-70">Active Sessions</div>
              <div className="text-4xl md:text-5xl font-extrabold leading-none mt-1">{totalSessions}</div>
            </div>

            <div className={`${GRID_CELL} p-6`}>
              <div className="text-sm opacity-70">Total Mouse Clicks</div>
              <div className="text-4xl md:text-5xl font-extrabold leading-none mt-1">{totalMouseClicks}</div>
            </div>

            <div className={`${GRID_CELL} p-6`}>
              <div className="text-sm opacity-70">Total Keystrokes</div>
              <div className="text-4xl md:text-5xl font-extrabold leading-none mt-1">{totalKeyStrokes}</div>
            </div>

            <div className={`${GRID_CELL} p-6`}>
              <div className="text-sm opacity-70">Avg Session (min)</div>
              <div className="text-4xl md:text-5xl font-extrabold leading-none mt-1">{avgSessionDuration.toFixed(1)}</div>
            </div>
          </div>
        )}
        {/* Data collection charts are rendered in the client-only SummaryCharts component above. */}
        <div className={`grid grid-cols-1 lg:grid-cols-3 items-start ${GRID_WRAPPER}`}>
          {/* Staff Logs */}
          <div className={GRID_CELL}>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-semibold">Staff Logs</span>
                <div className="text-sm text-surface-faint">{event.staff.length} teams</div>
              </div>
              <div>
                <Button size="sm" radius="full" variant="flat" onPress={() => setOpenStaff(v => !v)}>
                  {openStaff ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            {openStaff && (
              <div className="px-4 pb-4 space-y-4">
                {event.staff.map((team) => (
                  <div key={team.team} className="bg-surface-deepest p-3">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-semibold">{team.team}</h4>
                      <div className="text-sm text-surface-faint">{(team.log || []).length} entries</div>
                    </div>
                    <div className="mt-2 text-sm space-y-1">
                      {(team.log || []).map((entry, idx) => (
                        <div key={idx}>
                          {entry.message}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call Logs */}
          <div className={GRID_CELL}>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-semibold">Call Logs</span>
                <div className="text-sm text-surface-faint">{event.calls.length} calls</div>
              </div>
              <div>
                <Button size="sm" radius="full" variant="flat" onPress={() => setOpenCalls(v => !v)}>
                  {openCalls ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            {openCalls && (
              <div className="px-4 pb-4 space-y-4">
                {event.calls.map((call) => (
                  <div key={call.id} className="bg-surface-deepest p-3">
                    <div className="flex items-baseline justify-between">
                      <div className="font-semibold">Call #{getChronologicalCallNumber(call)} — {call.chiefComplaint}</div>
                      <div className="text-sm text-surface-faint">{call.location || 'No location'}</div>
                    </div>
                    <div className="mt-2 text-sm space-y-1">
                      {(call.log || []).map((entry, idx) => (
                        <div key={idx}>
                          {entry.message}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Surge Log — always shown so the three logs stay one row of columns. */}
          <div className={GRID_CELL}>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-semibold">Surge Log</span>
                <div className="text-sm text-surface-faint">{surgeLog.length} activation{surgeLog.length === 1 ? '' : 's'}</div>
              </div>
              {surgeLog.length > 0 && (
                <div>
                  <Button size="sm" radius="full" variant="flat" onPress={() => setOpenSurge(v => !v)}>
                    {openSurge ? 'Hide' : 'Show'}
                  </Button>
                </div>
              )}
            </div>
            {openSurge && surgeLog.length > 0 && (
              <div className="px-4 pb-4 space-y-2">
                {surgeLog.map((period, idx) => {
                  const stillActive = !period.endedAt;
                  const durationMin = Math.round(((period.endedAt ?? Date.now()) - period.startedAt) / 60000);
                  return (
                    <div key={idx} className="bg-surface-deepest p-3 text-sm">
                      <span className="font-semibold">{formatTimestamp(period.startedAt)}</span>
                      {' — '}
                      {stillActive ? 'still active' : formatTimestamp(period.endedAt!)}
                      <span className="text-surface-faint"> ({durationMin} min{stillActive ? ' so far' : ''})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Data Collection Details */}
        {totalSessions > 0 && (
          <div className={`grid grid-cols-1 ${GRID_WRAPPER}`}>
            <div className={GRID_CELL}>
              <button
                onClick={() => setOpenDataCollection(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-liner/10 transition"
              >
                <span className="font-semibold">Data Collection Sessions</span>
                <span className="text-xl">{openDataCollection ? '▾' : '▸'}</span>
              </button>
              {openDataCollection && (
                <div className="px-4 pb-4">
                  {interactionSessions.map((session) => (
                    <div key={session.sessionId} className="mb-4 p-3 bg-surface-deepest">
                      <h4 className="font-semibold mb-2">Session {session.sessionId}</h4>
                      <div className="text-sm space-y-1">
                        <p><strong>Started:</strong> {formatTimestamp(session.startTime)}</p>
                        {session.endTime && <p><strong>Ended:</strong> {formatTimestamp(session.endTime)}</p>}
                        <p><strong>Duration:</strong> {((session.endTime || Date.now()) - session.startTime) / 1000 / 60} minutes</p>
                        <p><strong>Mouse Clicks:</strong> {session.mouseClicks.length}</p>
                        <p><strong>Keystrokes:</strong> {session.keyStrokes.length}</p>
                        <p><strong>Clicks/min:</strong> {(session.mouseClicks.length / (((session.endTime || Date.now()) - session.startTime) / 1000 / 60)).toFixed(2)}</p>
                        <p><strong>Keys/min:</strong> {(session.keyStrokes.length / (((session.endTime || Date.now()) - session.startTime) / 1000 / 60)).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
      <ExportLogModal isOpen={showExportLogModal} onClose={() => setShowExportLogModal(false)} event={event} />
    </main>
  );
}
