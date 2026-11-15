import type { Event, TeamLogEntry } from '@/app/types';

/**
 * The dispatch board's running Log view: every team, supervisor and call log entry plus the notes typed into
 * the Log itself (`Event.eventLog`), in one timeline. It is rebuilt from those logs each time, so an edit made
 * in a team's or a call's own log shows here too. MCI log entries are added by the view (they need the MCI's
 * names to be described).
 */

export interface EventLogRow {
  key: string;
  t: number;
  /** Who or what the entry is about: a team or supervisor name, "Call 12", or "Note". */
  source: string;
  kind: 'team' | 'supervisor' | 'call' | 'note';
  /** The entry without its leading "HHMM - " (the row shows the time itself). */
  text: string;
}

/** Logs write "HHMM - what happened"; the view shows the time on its own. */
export function stripLogTime(message: string): string {
  return message.replace(/^\d{4}\s*-\s*/, '');
}

/** "HHMM" for a log line, as every other log writes it. */
export function logClock(ms: number): string {
  const d = new Date(ms);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
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

/** A note typed into the Log view, appended to `Event.eventLog`. */
export function addEventNote(event: Pick<Event, 'eventLog'>, text: string, now: number): Partial<Event> {
  const note = text.trim();
  if (!note) return {};
  return { eventLog: [...(event.eventLog || []), { timestamp: now, message: `${logClock(now)} - ${note}` }] };
}
