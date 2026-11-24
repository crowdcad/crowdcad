/**
 * Retention (Profile > Admin > Records): delete ended events a set number of days after they end. Off by
 * default. One record in the `settings` collection, readable by every signed-in account and written only
 * by admins (as the security settings are). The purge itself runs on the server (/api/records, see
 * src/lib/records/server.ts), on a schedule the deployment sets up (docs/COMPLIANCE.md), or when an admin
 * presses "Delete due events now". An event on legal hold is never purged.
 *
 * Pure and shared by the browser and the server; the browser-only reads and writes are in
 * retentionSettings.ts.
 */

export interface RecordSettings {
  /** 0 = keep ended events until someone deletes them. */
  deleteEndedAfterDays: number;
}

/** The record's fixed id: exactly 15 lowercase letters, the id format PocketBase requires. */
export const RECORD_SETTINGS_ID = 'recordretention';
export const RECORD_SETTINGS_KEY = 'records';

export const DEFAULT_RECORD_SETTINGS: RecordSettings = { deleteEndedAfterDays: 0 };

/** The days an admin can pick when retention is on (up to 10 years). */
export const RETENTION_LIMITS = { min: 1, max: 3650, suggested: 365 } as const;

const DAY_MS = 86_400_000;

/** Reads a stored record, falling back to "off" for anything missing or malformed. */
export function parseRecordSettings(raw: unknown): RecordSettings {
  const value = (raw as { value?: unknown } | null)?.value;
  const days = (value as { deleteEndedAfterDays?: unknown } | null)?.deleteEndedAfterDays;
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) return { ...DEFAULT_RECORD_SETTINGS };
  return { deleteEndedAfterDays: Math.min(Math.floor(days), RETENTION_LIMITS.max) };
}

export function describeRetention(days: number): string {
  return days > 0 ? `delete ended events after ${days} day${days === 1 ? '' : 's'}` : 'keep ended events';
}

/** What the purge looks at on an event. */
export interface RetentionFacts {
  ended?: boolean;
  endedAt?: number;
  legalHold?: boolean;
}

/** When an ended event becomes due for deletion (epoch ms), or null when it never does (retention off, not ended). */
export function purgeDueAt(event: RetentionFacts, settings: RecordSettings): number | null {
  if (settings.deleteEndedAfterDays <= 0 || event.ended !== true) return null;
  if (typeof event.endedAt !== 'number' || !Number.isFinite(event.endedAt)) return null;
  return event.endedAt + settings.deleteEndedAfterDays * DAY_MS;
}

export type PurgeVerdict = 'due' | 'held' | 'keep';

/** Whether retention deletes this event now: `held` when it would but a legal hold stops it. */
export function purgeVerdict(event: RetentionFacts, settings: RecordSettings, now: number): PurgeVerdict {
  const at = purgeDueAt(event, settings);
  if (at === null || at > now) return 'keep';
  return event.legalHold === true ? 'held' : 'due';
}
