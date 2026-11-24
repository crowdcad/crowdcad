/**
 * An event's full record (#41): everything kept for it, as one JSON file, for record keeping and records
 * requests. The event's owner (or an admin) exports it from the summary page. It holds the event document
 * with every pack's state merged in (calls and their logs, teams and their logs, clinic, event log,
 * surge history), the event's audit rows, and what each extension pack keeps beside it
 * (CrowdcadExtension.eventRecord). The summary CSV stays the everyday export.
 */
import type { Event } from '@/app/types';
import type { AuditEntry } from '@/lib/services/audit';

export const EVENT_RECORD_FORMAT = 'crowdcad.event-record';
export const EVENT_RECORD_VERSION = 1;

export interface EventRecord {
  format: typeof EVENT_RECORD_FORMAT;
  version: number;
  /** ISO time of the export, and who made it (email). */
  exportedAt: string;
  exportedBy: string;
  eventId: string;
  event: Event;
  /** The event's audit rows, oldest first. */
  audit: AuditEntry[];
  /** Each extension pack's own documents for the event, by pack id. */
  packs: Record<string, Record<string, unknown>>;
}

/** An audit row without the database's id for it. */
function withoutId(row: AuditEntry & { id?: string }): AuditEntry {
  const copy = { ...row };
  delete copy.id;
  return copy;
}

export function buildEventRecord(input: {
  eventId: string;
  event: Event;
  audit: (AuditEntry & { id?: string })[];
  packs: Record<string, Record<string, unknown> | null>;
  exportedBy: string;
  now: number;
}): EventRecord {
  const packs: Record<string, Record<string, unknown>> = {};
  for (const [id, part] of Object.entries(input.packs)) if (part) packs[id] = part;
  return {
    format: EVENT_RECORD_FORMAT,
    version: EVENT_RECORD_VERSION,
    exportedAt: new Date(input.now).toISOString(),
    exportedBy: input.exportedBy,
    eventId: input.eventId,
    event: { ...input.event, id: input.eventId },
    audit: input.audit.map(withoutId).sort((a, b) => a.t - b.t),
    packs,
  };
}

/** The file name for an event's record: `<name>_Record_<yyyy-mm-dd>.json`, safe on every OS. */
export function eventRecordFileName(name: string | undefined, eventId: string, now: number): string {
  const base = (name || eventId).replace(/[\/:*?"<>|\x00-\x1f]+/g, '_').trim().slice(0, 80) || eventId;
  return `${base}_Record_${new Date(now).toISOString().slice(0, 10)}.json`;
}
