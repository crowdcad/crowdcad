import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import '@/extensions/installed.server';
import { bearerToken, getServerStore, serverErrorStatus, type ServerStore } from '@/lib/server/serverStore';
import { deleteEventRecords, mayDeleteEvent, purgeEndedEvents, SCHEDULE_ACTOR, type RecordActor } from '@/lib/records/server';

/**
 * Event records on the server (src/lib/records/server.ts), with the backend's own credentials (the Firebase
 * Admin SDK, or a PocketBase superuser):
 *
 * - `{ action: 'delete', eventId }`: deletes an event and everything kept for it. The event's owner, a
 *   member of its organization, or an admin. Refused (409) while the event is on legal hold.
 * - `{ action: 'purge', dryRun? }`: the retention purge. Deletes ended events past the retention period
 *   (Profile > Admin > Records), skipping those on legal hold, and lists what it did. An admin, or a
 *   scheduler presenting `x-records-key` equal to the server's RECORDS_PURGE_KEY (docs/COMPLIANCE.md).
 *
 * Without credentials for the backend it answers 501; the browser then deletes an event itself where the
 * rules allow it (src/lib/records/client.ts), and the purge isn't available.
 */
export const runtime = 'nodejs';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Whether the request carries the scheduler's key (compared in constant time). */
function hasScheduleKey(req: Request): boolean {
  const expected = process.env.RECORDS_PURGE_KEY;
  const given = req.headers.get('x-records-key');
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function caller(store: ServerStore, req: Request): Promise<RecordActor | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { uid, email } = await store.verify(token);
  return { uid, actor: email ?? uid };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: unknown; eventId?: unknown; dryRun?: unknown } | null;
  const action = body?.action;
  if (action !== 'delete' && action !== 'purge') return json({ error: 'Invalid request.' }, 400);

  try {
    const store = await getServerStore();

    if (action === 'purge') {
      const scheduled = hasScheduleKey(req);
      const by = scheduled ? SCHEDULE_ACTOR : await caller(store, req);
      if (!by) return json({ error: 'Not signed in.' }, 401);
      if (!scheduled && !(await store.isAdmin(by.uid))) return json({ error: 'Only admins can run the retention purge.' }, 403);
      return json(await purgeEndedEvents(store, by, { dryRun: body?.dryRun === true }));
    }

    const eventId = typeof body?.eventId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.eventId) ? body.eventId : null;
    if (!eventId) return json({ error: 'Invalid request.' }, 400);
    const by = await caller(store, req);
    if (!by) return json({ error: 'Not signed in.' }, 401);
    const event = (await store.get<Parameters<typeof mayDeleteEvent>[1]>(`events/${eventId}`)).data;
    if (!event) return json({ ok: true, missing: true });
    if (!(await mayDeleteEvent(store, event, by.uid))) return json({ error: 'Only the event owner or an admin can delete it.' }, 403);
    const outcome = await deleteEventRecords(store, eventId, by, { action: 'event.delete' });
    if ('held' in outcome) return json({ error: 'This event is on legal hold. Release the hold before deleting it.', code: 'held' }, 409);
    return json({ ok: true, ...outcome });
  } catch (err) {
    const status = serverErrorStatus(err);
    if (status === 401) return json({ error: 'Sign in again.' }, 401);
    if (status === 501) return json({ error: 'This server has no database credentials.' }, 501);
    console.error('records:', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}
