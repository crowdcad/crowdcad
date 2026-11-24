/**
 * Event records from the browser (#41, #42): deleting an event, legal hold, the retention setting and
 * the purge. Deleting and purging go through /api/records, which deletes everything kept for an event
 * (src/lib/records/server.ts). Where the server has no database credentials (it answers 501, as on the
 * local emulators) the browser deletes the event document itself, as the rules allow, and the purge
 * isn't available.
 */
import { auditLog, dbService, type Unsubscribe } from '@/lib/services';
import { currentAuthToken } from '@/lib/services/apiToken';
import type { Event } from '@/app/types';
import { SETTINGS_COLLECTION } from '@/lib/securitySettings';
import { describeRetention, parseRecordSettings, RECORD_SETTINGS_ID, RECORD_SETTINGS_KEY, DEFAULT_RECORD_SETTINGS, type RecordSettings } from './retention';
import type { PurgeReport } from './server';
import { loadExtensionData, withMember } from '@/extensions';
import { buildEventRecord, eventRecordFileName } from './eventRecord';

export type { PurgeReport };

/** The event is on legal hold, so it can't be deleted. */
export class LegalHoldError extends Error {
  constructor() {
    super('This event is on legal hold. Release the hold before deleting it.');
  }
}

/** The server can't do this here (no database credentials, or no such route). */
export class RecordsServerUnavailable extends Error {
  constructor() {
    super("This needs the server's database credentials, which this deployment doesn't have.");
  }
}

// On the Firebase emulators the server has no emulator credentials of its own.
const usesEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && process.env.NEXT_PUBLIC_BACKEND !== 'pocketbase';

async function callRecords(body: Record<string, unknown>): Promise<Response> {
  if (usesEmulator) throw new RecordsServerUnavailable();
  const token = await currentAuthToken();
  if (!token) throw new Error('Sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RecordsServerUnavailable();
  }
  if (res.status === 404 || res.status === 501) throw new RecordsServerUnavailable();
  return res;
}

async function refusal(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (body.code === 'held') return new LegalHoldError();
  return new Error(body.error || `The server refused (${res.status}).`);
}

/**
 * Deletes an event and everything kept for it. Refuses an event on legal hold (LegalHoldError). The
 * server records the deletion in the audit log; the browser fallback records it itself.
 */
export async function deleteEvent(eventId: string, name?: string): Promise<void> {
  try {
    const res = await callRecords({ action: 'delete', eventId });
    if (!res.ok) throw await refusal(res);
    return;
  } catch (err) {
    if (!(err instanceof RecordsServerUnavailable)) throw err;
  }
  const snap = await dbService.getDocument<Event>('events', eventId);
  if (!snap.exists) return;
  if (snap.data?.legalHold === true) throw new LegalHoldError();
  await dbService.deleteDocument('events', eventId);
  void auditLog.record({ action: 'event.delete', eventId, target: name ?? snap.data?.name });
}

/**
 * An event's full record as JSON (src/lib/records/eventRecord.ts), for its owner or an admin, and the
 * file name to save it under. Recorded in the audit log. Fails rather than leave a part out.
 */
export async function exportEventRecord(eventId: string, exportedBy: string): Promise<{ fileName: string; json: string }> {
  const snap = await dbService.getDocument<Event>('events', eventId);
  if (!snap.exists || !snap.data) throw new Error('Event not found.');
  const event = await loadExtensionData(eventId, snap.data);
  const [audit, parts] = await Promise.all([
    auditLog.forEvent(eventId),
    Promise.all(withMember('eventRecord').map(async (x) => [x.id, await x.eventRecord(eventId, event)] as const)),
  ]);
  const now = Date.now();
  const record = buildEventRecord({ eventId, event, audit, packs: Object.fromEntries(parts), exportedBy, now });
  void auditLog.record({ action: 'event.export', eventId, target: event.name, detail: 'full record (JSON)' });
  return { fileName: eventRecordFileName(event.name, eventId, now), json: JSON.stringify(record, null, 2) };
}

/** Places or releases a legal hold (the event's owner or an admin). Recorded in the audit log. */
export async function setLegalHold(event: Pick<Event, 'id' | 'name'>, on: boolean, by: string): Promise<void> {
  await dbService.updateDocument('events', event.id, on ? { legalHold: true, legalHoldAt: Date.now(), legalHoldBy: by } : { legalHold: false });
  void auditLog.record({ action: on ? 'event.hold' : 'event.release', eventId: event.id, target: event.name });
}

/** The retention purge (admins): with `dryRun`, only what it would delete. */
export async function runRetentionPurge(dryRun: boolean): Promise<PurgeReport> {
  const res = await callRecords({ action: 'purge', dryRun });
  if (!res.ok) throw await refusal(res);
  return (await res.json()) as PurgeReport;
}

/** Live retention setting; `onChange` gets "off" when the record is missing or unreadable. */
export function subscribeRecordSettings(onChange: (settings: RecordSettings) => void): Unsubscribe {
  return dbService.subscribeToDocument(
    SETTINGS_COLLECTION,
    RECORD_SETTINGS_ID,
    (snap) => onChange(parseRecordSettings(snap.exists ? snap.data : null)),
    () => onChange({ ...DEFAULT_RECORD_SETTINGS }),
  );
}

/** Saves the retention setting (admins only) and records the change in the audit log. */
export async function saveRecordSettings(next: RecordSettings, previous: RecordSettings): Promise<void> {
  const clean = parseRecordSettings({ value: next });
  await dbService.setDocument(SETTINGS_COLLECTION, RECORD_SETTINGS_ID, { key: RECORD_SETTINGS_KEY, value: clean });
  if (clean.deleteEndedAfterDays !== previous.deleteEndedAfterDays) {
    void auditLog.record({ action: 'settings.change', target: 'records.retention', detail: describeRetention(clean.deleteEndedAfterDays) });
  }
}
