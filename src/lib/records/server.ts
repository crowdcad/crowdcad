/**
 * Deleting an event's records on the server, and the retention purge (#42). Used by /api/records.
 *
 * Deleting an event takes everything kept for it: its document, every document under it (store.deleteTree),
 * and what extension packs keep elsewhere (ServerExtension.deleteEventData, e.g. login accounts). An event
 * on legal hold is refused. Each deletion leaves one audit row. Server-only.
 */
import type { Event } from '@/app/types';
import { AUDIT_COLLECTION, type AuditEntry } from '@/lib/services/audit';
import type { ServerStore } from '@/lib/server/serverStore';
import { serverExtensions } from '@/extensions/server';
import { parseRecordSettings, purgeVerdict, RECORD_SETTINGS_ID, type RecordSettings } from './retention';

/** Who a deletion is recorded as: a signed-in account, or the scheduled purge. */
export interface RecordActor {
  uid: string;
  actor: string;
}

export const SCHEDULE_ACTOR: RecordActor = { uid: 'system', actor: 'Retention schedule' };

export type DeleteOutcome = { deleted: true } | { missing: true } | { held: true };

/** The event's fields that decide who may delete it and whether it's held. */
type EventFacts = Pick<Event, 'name' | 'userId' | 'ended' | 'endedAt' | 'legalHold'> & { orgId?: string };

/** Who may delete an event: its owner, a member of its organization, or an admin (as the rules allow). */
export async function mayDeleteEvent(store: ServerStore, event: EventFacts, uid: string): Promise<boolean> {
  if (event.userId === uid) return true;
  if (typeof event.orgId === 'string' && (await store.orgMembers(event.orgId)).includes(uid)) return true;
  return store.isAdmin(uid);
}

/** Deletes an event and everything kept for it, unless it is on legal hold. */
export async function deleteEventRecords(
  store: ServerStore,
  eventId: string,
  by: RecordActor,
  how: { action: 'event.delete' | 'event.purge'; detail?: string; now?: number },
): Promise<DeleteOutcome> {
  const event = (await store.get<EventFacts>(`events/${eventId}`)).data;
  if (!event) return { missing: true };
  if (event.legalHold === true) return { held: true };

  const notes: string[] = [];
  for (const pack of serverExtensions) {
    const note = await pack.deleteEventData?.(store, eventId);
    if (note) notes.push(note);
  }
  await store.deleteTree(`events/${eventId}`);

  const detail = [how.detail, ...notes].filter(Boolean).join('; ');
  const row: AuditEntry = { t: how.now ?? Date.now(), uid: by.uid, actor: by.actor, action: how.action, eventId };
  if (event.name) row.target = String(event.name).slice(0, 200);
  if (detail) row.detail = detail.slice(0, 500);
  await store.add(AUDIT_COLLECTION, row);
  return { deleted: true };
}

export async function readRecordSettings(store: ServerStore): Promise<RecordSettings> {
  return parseRecordSettings((await store.get(`settings/${RECORD_SETTINGS_ID}`)).data ?? null);
}

export interface PurgeItem {
  id: string;
  name: string;
  endedAt: number;
}

export interface PurgeReport {
  deleteEndedAfterDays: number;
  /** Events retention deletes now (deleted already, unless this was a dry run). */
  due: PurgeItem[];
  /** Events retention would delete but a legal hold keeps. */
  held: PurgeItem[];
  /** How many were deleted (0 on a dry run). */
  deleted: number;
}

/** Finds ended events past the retention period and, unless `dryRun`, deletes them. */
export async function purgeEndedEvents(store: ServerStore, by: RecordActor, options: { dryRun?: boolean; now?: number } = {}): Promise<PurgeReport> {
  const now = options.now ?? Date.now();
  const settings = await readRecordSettings(store);
  const report: PurgeReport = { deleteEndedAfterDays: settings.deleteEndedAfterDays, due: [], held: [], deleted: 0 };
  if (settings.deleteEndedAfterDays <= 0) return report;

  const ended = await store.where<EventFacts>('events', 'ended', true);
  for (const { id, data } of ended) {
    const verdict = purgeVerdict(data, settings, now);
    if (verdict === 'keep') continue;
    const item = { id, name: String(data.name ?? ''), endedAt: Number(data.endedAt) };
    (verdict === 'held' ? report.held : report.due).push(item);
  }
  if (options.dryRun) return report;

  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  for (const item of report.due) {
    const outcome = await deleteEventRecords(store, item.id, by, {
      action: 'event.purge',
      detail: `retention: ended ${day(item.endedAt)}, kept ${settings.deleteEndedAfterDays} days`,
      now,
    });
    if ('deleted' in outcome) report.deleted++;
  }
  return report;
}
