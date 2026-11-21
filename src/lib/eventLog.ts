import { extensions } from '@/extensions';
import type { Event, TeamLogEntry } from '@/app/types';

/**
 * The dispatch board's running Log view: every team, supervisor and call log entry plus the notes typed
 * into the Log on earlier events (`Event.eventLog`), in one timeline. It is rebuilt from those logs each time,
 * so an edit made in a team's or a call's own log shows here too. MCI log entries are added by the view (they
 * need the MCI's names to be described). The view filters it by kind, a recent time window and a search
 * (keywords and/or a time range, see `parseLogSearch`).
 */

/** Built-in kinds, plus any an extension pack adds (`logKinds`). */
export type EventLogKind = 'team' | 'supervisor' | 'call' | 'note' | (string & {});

/** Every kind the Log offers: the built-in ones with extension packs' before Notes. Read when needed, never at load. */
export function eventLogKinds(): { key: EventLogKind; label: string }[] {
  return [
    { key: 'team', label: 'Teams' },
    { key: 'supervisor', label: 'Supervisors' },
    { key: 'call', label: 'Calls' },
    ...extensions.flatMap((x) => x.logKinds ?? []),
    { key: 'note', label: 'Notes' },
  ];
}

/** Recent windows offered by the filter, in minutes (0: all). */
export const EVENT_LOG_WINDOWS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'All time' },
  { minutes: 15, label: 'Last 15 min' },
  { minutes: 60, label: 'Last hour' },
  { minutes: 240, label: 'Last 4 hours' },
];

export interface EventLogFilter {
  /** Kinds turned off; every other kind shows (so a pack's new kind shows by default). */
  hiddenKinds: EventLogKind[];
  /** Only entries from the last this many minutes; 0 for all. */
  windowMinutes: number;
}

export const ALL_EVENT_LOG: EventLogFilter = { hiddenKinds: [], windowMinutes: 0 };

export interface EventLogRow {
  key: string;
  t: number;
  /** Who or what the entry is about: a team or supervisor name, "Call 12", or "Note". */
  source: string;
  kind: EventLogKind;
  /** The entry without its leading "HHMM - " (the row shows the time itself). */
  text: string;
}

/** Logs write "HHMM - what happened"; the view shows the time on its own. */
export function stripLogTime(message: string): string {
  return message.replace(/^\d{4}\s*-\s*/, '');
}

export function eventLogRows(event: Pick<Event, 'staff' | 'supervisor' | 'calls' | 'eventLog'>): EventLogRow[] {
  const rows: EventLogRow[] = [];
  const add = (log: TeamLogEntry[] | undefined, kind: EventLogRow['kind'], source: string, keyBase: string) =>
    (log || []).forEach((entry, i) => {
      if (!entry?.message?.trim()) return;
      rows.push({ key: `${keyBase}:${i}`, t: entry.timestamp, source, kind, text: stripLogTime(entry.message) });
    });
  (event.staff || []).forEach((s) => add(s.log, 'team', s.team, `team:${s.id ?? s.team}`));
  (event.supervisor || []).forEach((s) => add(s.log, 'supervisor', s.team, `sup:${s.id ?? s.team}`));
  (event.calls || []).forEach((c) => add(c.log, 'call', `Call ${c.order}`, `call:${c.id}`));
  add(event.eventLog, 'note', 'Note', 'note');
  return rows;
}

/** Minutes after midnight for "14:05", "1405" or "9" (an hour), else null. */
function minutesOf(text: string): number | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * A Log search: a time range anywhere in it ("14:00-15:30", "1400-1530", "9-10"; the end minute is included)
 * and keywords, all of which must appear in the entry (its source, text or time), ignoring case.
 */
export function parseLogSearch(query: string): { from?: number; to?: number; words: string[] } {
  let from: number | undefined;
  let to: number | undefined;
  const rest = query.replace(/(\d{1,2}(?::?\d{2})?)\s*(?:-|–|to)\s*(\d{1,2}(?::?\d{2})?)/i, (whole, a: string, b: string) => {
    const start = minutesOf(a);
    const end = minutesOf(b);
    if (start === null || end === null) return whole;
    from = start;
    to = end;
    return ' ';
  });
  const words = rest.toLowerCase().split(/\s+/).filter(Boolean);
  return { ...(from !== undefined ? { from, to } : {}), words };
}

/** Rows that pass the filter and search, keeping their order. `clock` gives each row's time as shown, so it can be searched. */
export function filterEventLog<R extends { t: number; source: string; text: string; kind: EventLogKind }>(
  rows: R[],
  filter: EventLogFilter,
  query: string,
  now: number,
  clock: (ms: number) => string,
): R[] {
  const hidden = new Set(filter.hiddenKinds);
  const since = filter.windowMinutes ? now - filter.windowMinutes * 60_000 : -Infinity;
  const { from, to, words } = parseLogSearch(query);
  return rows.filter((r) => {
    if (hidden.has(r.kind) || r.t < since) return false;
    if (from !== undefined && to !== undefined) {
      const d = new Date(r.t);
      const m = d.getHours() * 60 + d.getMinutes();
      // A range past midnight ("23:00-01:00") wraps.
      if (from <= to ? m < from || m > to : m < from && m > to) return false;
    }
    if (!words.length) return true;
    const hay = `${clock(r.t)} ${r.source} ${r.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
