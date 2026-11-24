/**
 * Deleting events and the retention purge (src/lib/records/server.ts) against a real backend, through the
 * server store. Skipped unless one is configured; it writes test records there, so use a scratch instance:
 *
 *   Firestore emulator:  npm run test:integration
 *   PocketBase:          npm run test:pocketbase (a scratch PocketBase, scripts/scratch-pocketbase.mjs)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerStore } from '@/lib/server/serverStore';
import { installServerExtensions } from '@/extensions/server';
import { deleteEventRecords, purgeEndedEvents, SCHEDULE_ACTOR } from './server';

const pbUrl = process.env.PB_TEST_URL;
const firestore = !!process.env.FIRESTORE_EMULATOR_HOST && !pbUrl;
const run = firestore || (pbUrl && process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) ? describe : describe.skip;

const DAY = 86_400_000;
const now = Date.now();

run(`records on ${firestore ? 'the Firestore emulator' : 'PocketBase'}`, () => {
  let store: ServerStore;
  const packCalls: string[] = [];
  const ids: Record<string, string> = {};
  const by = { uid: 'admin-test', actor: 'admin@x.org' };

  /** Whether this backend stores documents under an event (Firestore always; PocketBase once a pack set it up). */
  let nested = firestore;

  /** Makes an event and, where the backend has them, one document under it; returns its id. */
  async function makeEvent(name: string, fields: Record<string, unknown>): Promise<string> {
    const id = (firestore ? 'rec' : '') + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
    const pbId = id.slice(0, 15).padEnd(15, '0');
    const eventId = firestore ? id : pbId;
    await store.runTransaction(eventId, async (tx) => {
      tx.set(`events/${eventId}`, { name, userId: 'owner-test', ...fields });
      if (nested) tx.set(`events/${eventId}/field/state`, { requests: [], eventId });
    });
    return eventId;
  }

  beforeAll(async () => {
    if (firestore) {
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= 'demo-crowdcad';
      store = await (await import('@/lib/server/firestoreServerStore')).createFirestoreServerStore();
    } else {
      process.env.PB_URL = pbUrl;
      const pb = await import('@/lib/server/pocketbaseServerStore');
      store = await pb.createPocketbaseServerStore();
      const su = await (await pb.pocketbaseSuperuser())();
      nested = await su.collections.getOne('event_docs').then(() => true, () => false);
    }
    installServerExtensions([{ id: 'test', deleteEventData: async (_s, eventId) => void packCalls.push(eventId) }]);
    await store.runTransaction('settings', async (tx) => tx.set('settings/recordretention', { key: 'records', value: { deleteEndedAfterDays: 30 } }));
    ids.old = await makeEvent('Old', { ended: true, endedAt: now - 40 * DAY });
    ids.recent = await makeEvent('Recent', { ended: true, endedAt: now - 5 * DAY });
    ids.held = await makeEvent('Held', { ended: true, endedAt: now - 400 * DAY, legalHold: true });
    ids.active = await makeEvent('Active', { ended: false });
  });

  afterAll(async () => {
    installServerExtensions([]);
    await store?.runTransaction('settings', async (tx) => tx.set('settings/recordretention', { key: 'records', value: { deleteEndedAfterDays: 0 } }));
    for (const id of Object.values(ids)) await store?.deleteTree(`events/${id}`).catch(() => {});
  });

  it('a dry run lists due and held events and deletes nothing', async () => {
    const report = await purgeEndedEvents(store, by, { dryRun: true, now });
    const due = report.due.map((e) => e.id);
    expect(due).toContain(ids.old);
    expect(due).not.toContain(ids.recent);
    expect(due).not.toContain(ids.active);
    expect(report.held.map((e) => e.id)).toContain(ids.held);
    expect(report.deleted).toBe(0);
    expect((await store.get(`events/${ids.old}`)).exists).toBe(true);
  });

  it('refuses to delete an event on legal hold', async () => {
    await expect(deleteEventRecords(store, ids.held, by, { action: 'event.delete' })).resolves.toEqual({ held: true });
    expect((await store.get(`events/${ids.held}`)).exists).toBe(true);
  });

  it('purges due events with everything under them, asks packs, and leaves an audit row', async () => {
    const report = await purgeEndedEvents(store, SCHEDULE_ACTOR, { now });
    expect(report.deleted).toBeGreaterThanOrEqual(1);
    expect((await store.get(`events/${ids.old}`)).exists).toBe(false);
    if (nested) expect((await store.get(`events/${ids.old}/field/state`)).exists).toBe(false);
    expect(packCalls).toContain(ids.old);
    for (const kept of [ids.recent, ids.held, ids.active]) expect((await store.get(`events/${kept}`)).exists).toBe(true);
    const rows = await store.where<{ action: string; uid: string; detail?: string }>('audit', 'eventId', ids.old);
    expect(rows.some((r) => r.data.action === 'event.purge' && r.data.uid === 'system' && /retention/.test(r.data.detail ?? ''))).toBe(true);
  });

  it('deletes one event on request, with an audit row naming who', async () => {
    await expect(deleteEventRecords(store, ids.active, by, { action: 'event.delete' })).resolves.toEqual({ deleted: true });
    if (nested) expect((await store.get(`events/${ids.active}/field/state`)).exists).toBe(false);
    const rows = await store.where<{ action: string; uid: string }>('audit', 'eventId', ids.active);
    expect(rows.some((r) => r.data.action === 'event.delete' && r.data.uid === by.uid)).toBe(true);
    await expect(deleteEventRecords(store, ids.active, by, { action: 'event.delete' })).resolves.toEqual({ missing: true });
  });
});
