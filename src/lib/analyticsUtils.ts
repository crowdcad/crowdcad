import { Event, Staff } from '@/app/types';
import { getLastActivityTimestamp, getScheduleBounds } from './eventStatus';

const TWO_HOURS = 2 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

const AVAILABLE = 'Available';
const ON_BREAK = 'On Break';
const IN_CLINIC = 'In Clinic';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The reporting window used for the summary page's charts and stats.
 *
 * Start: the later of the event's designated start (event setup's From,
 * now mandatory on new events — `scheduleStart`/`postingStart`/`startTime`/
 * `start`, earliest of whichever are present) and when the event was
 * actually initialized (`createdAt`). An event created ahead of its own
 * start time has no real data before that start, so the window doesn't
 * waste space on it; an event created (and so actually begun) after its
 * designated start — a late setup — starts the window there instead, since
 * nothing happened before that either.
 *
 * End: the most recent real dispatch activity (`getLastActivityTimestamp`)
 * — not the designated end or any "still running" backstop — so checking an
 * event's summary (or its designated end) early doesn't stretch the chart
 * out to cover dead time nothing has happened in yet.
 *
 * Events created before scheduleStart/End existed, with neither field nor
 * any recorded activity, fall back to a padded window derived from the
 * earliest/latest call log timestamp, so old data doesn't just disappear.
 */
export function getScheduleWindow(event: Event): { start: number; end: number } {
  const getNum = (v: unknown): number | undefined => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const parsed = Date.parse(v);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  const startFields = ['postingStart', 'scheduleStart', 'startTime', 'start'];

  // scheduleStart as corrected for events saved a day off (getScheduleBounds).
  const scheduleStart = getScheduleBounds(event).start ?? undefined;
  const starts = startFields
    .map((k) => (k === 'scheduleStart' ? scheduleStart : getNum(event[k as keyof Event])))
    .filter((v): v is number => v !== undefined);

  const designatedStart = starts.length ? Math.min(...starts) : undefined;
  const createdAt = getNum(event.createdAt);

  const start =
    designatedStart !== undefined && createdAt !== undefined
      ? Math.max(designatedStart, createdAt)
      : designatedStart ?? createdAt;

  const lastActivity = getLastActivityTimestamp(event);

  if (start !== undefined && lastActivity !== null) {
    return { start, end: Math.max(lastActivity, start) };
  }

  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;
  for (const call of event.calls || []) {
    for (const entry of call.log || []) {
      if (typeof entry.timestamp === 'number') {
        if (entry.timestamp < minTs) minTs = entry.timestamp;
        if (entry.timestamp > maxTs) maxTs = entry.timestamp;
      }
    }
  }

  const derivedStart = Number.isFinite(minTs) ? minTs : Date.now();
  const derivedEnd = Number.isFinite(maxTs) ? maxTs : derivedStart + 4 * 60 * 60 * 1000;

  const fallbackStart = (start ?? derivedStart) - TWO_HOURS;
  const fallbackEnd = (lastActivity ?? derivedEnd) + TWO_HOURS;
  return { start: fallbackStart, end: fallbackEnd };
}

export function callsByTeam(event: Event): { team: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const call of event.calls || []) {
    const assigned = call.assignedTeam ?? [];
    const detached = (call.detachedTeams ?? []).map((d) => d.team);
    const involved = new Set([...assigned, ...detached].filter(Boolean));

    for (const team of involved) counts[team] = (counts[team] ?? 0) + 1;
  }

  return Object.entries(counts).map(([team, count]) => ({ team, count }));
}

/**
 * Pulls the status a log message implies, for the handful of message shapes
 * that unambiguously carry one (see the call sites in the dispatch page:
 * manual status changes, call assignment, detachment, and admin resets).
 * Anything else (post changes, roster edits, etc.) returns null and is
 * ignored by the caller — the prior status just carries forward.
 */
function statusFromLogMessage(message: string): string | null {
  const changedTo = message.match(/status changed to (.+?)\.?$/i);
  if (changedTo) return changedTo[1].trim();

  const setTo = message.match(/status set to (.+?)(?:\s+at\s+\S.*)?$/i);
  if (setTo) return setTo[1].trim();

  if (/responding to call/i.test(message)) return 'En Route';
  if (/detached from call|freed from duplicate call/i.test(message)) return AVAILABLE;

  return null;
}

export type TeamStatusSegment = { status: string; start: number; end: number };

/**
 * Staff only stores a team's *current* status — this reconstructs status
 * over time from the team's free-text log so time-in-status can be
 * computed. Only messages statusFromLogMessage recognizes advance the
 * timeline; teams default to Available before their first recognized entry
 * (the log has no record of a team's status before it starts logging).
 * This is a best-effort reconstruction, not an authoritative audit trail —
 * a handful of rarer status-changing actions in the dispatch page don't log
 * a recognizable message and won't be reflected here.
 */
export function deriveTeamStatusSegments(
  team: Staff,
  windowStart: number,
  windowEnd: number
): TeamStatusSegment[] {
  const changes = (team.log || [])
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => ({ ts: entry.timestamp, status: statusFromLogMessage(entry.message || '') }))
    .filter((e): e is { ts: number; status: string } => e.status != null);

  const segments: TeamStatusSegment[] = [];
  let currentStatus = AVAILABLE;
  let segmentStart = windowStart;

  for (const change of changes) {
    if (change.ts <= windowStart) {
      currentStatus = change.status;
      continue;
    }
    if (change.ts >= windowEnd) break;
    if (change.status === currentStatus) continue;
    segments.push({ status: currentStatus, start: segmentStart, end: change.ts });
    currentStatus = change.status;
    segmentStart = change.ts;
  }
  segments.push({ status: currentStatus, start: segmentStart, end: windowEnd });

  return segments.filter((s) => s.end > s.start);
}

export type TeamStatusBreakdown = {
  team: string;
  available: number; // percent of tracked time, 0-100
  onBreak: number;
  inClinic: number;
  onCalls: number;
  calls: number; // count of calls this team was attached to
};

/** Per-team proportion of the event spent Available / On Break / In Clinic / on a call, plus how many calls each team was attached to. */
export function teamStatusBreakdown(
  event: Event,
  windowStart: number,
  windowEnd: number
): TeamStatusBreakdown[] {
  const span = windowEnd - windowStart;
  const callCounts = new Map(callsByTeam(event).map((d) => [d.team, d.count]));
  const pct = (ms: number) => round1(span > 0 ? (ms / span) * 100 : 0);

  return (event.staff || []).map((team) => {
    const totals = { available: 0, onBreak: 0, inClinic: 0, onCalls: 0 };

    for (const seg of deriveTeamStatusSegments(team, windowStart, windowEnd)) {
      const duration = seg.end - seg.start;
      if (seg.status === ON_BREAK) totals.onBreak += duration;
      else if (seg.status === IN_CLINIC) totals.inClinic += duration;
      else if (seg.status === AVAILABLE) totals.available += duration;
      else totals.onCalls += duration;
    }

    return {
      team: team.team,
      available: pct(totals.available),
      onBreak: pct(totals.onBreak),
      inClinic: pct(totals.inClinic),
      onCalls: pct(totals.onCalls),
      calls: callCounts.get(team.team) ?? 0,
    };
  });
}

export type AvailabilityPoint = { ts: number; label: string; availability: number; surging: boolean };

export type SurgeInterval = { start: number; end: number };

/**
 * Every surge period this event has had, as closed [start, end) intervals —
 * a currently-open period (no `endedAt` yet, i.e. surge is still active as
 * of viewing) is closed at `windowEnd` so it still renders on a live event's
 * summary instead of being dropped.
 */
export function getSurgeIntervals(event: Event, windowEnd: number): SurgeInterval[] {
  return (event.surgeLog || [])
    .map((period) => ({ start: period.startedAt, end: period.endedAt ?? windowEnd }))
    .filter((interval) => interval.end > interval.start);
}

/**
 * Average percent of teams sitting Available, in 10-minute buckets across
 * the event (six buckets per hour). Every bucket carries an HH:MM label,
 * but bucket boundaries stay hour-aligned (the window is floored/ceiled to
 * the hour) so the chart's x-axis can show a tick only on the hour while
 * still plotting a bar every 10 minutes. `surging` is true for any bucket
 * that overlapped an active surge period at all (see `getSurgeIntervals`).
 */
export function teamAvailabilitySeries(
  event: Event,
  start: number,
  end: number,
  surgeIntervals: SurgeInterval[] = []
): AvailabilityPoint[] {
  const s = Math.floor(start / HOUR) * HOUR;
  const e = Math.ceil(end / HOUR) * HOUR;
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const teams = event.staff || [];
  const teamSegments = teams.map((team) => deriveTeamStatusSegments(team, s, e));

  const buckets: AvailabilityPoint[] = [];
  for (let t = s; t <= e; t += TEN_MINUTES) {
    const bucketEnd = t + TEN_MINUTES;
    const bucketDate = new Date(t);
    const label = `${pad2(bucketDate.getHours())}:${pad2(bucketDate.getMinutes())}`;
    const surging = surgeIntervals.some((iv) => iv.start < bucketEnd && iv.end > t);

    if (teams.length === 0) {
      buckets.push({ ts: t, label, availability: 0, surging });
      continue;
    }

    let availableMs = 0;
    for (const segments of teamSegments) {
      for (const seg of segments) {
        if (seg.status !== AVAILABLE) continue;
        const overlap = Math.min(seg.end, bucketEnd) - Math.max(seg.start, t);
        if (overlap > 0) availableMs += overlap;
      }
    }

    const availability = (availableMs / (TEN_MINUTES * teams.length)) * 100;
    buckets.push({ ts: t, label, availability: round1(availability), surging });
  }

  return buckets;
}
