import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { buildEventRecord, EVENT_RECORD_FORMAT, eventRecordFileName } from './eventRecord';

const event = { name: 'Big Game', calls: [{ id: 'c1', log: [{ timestamp: 1, message: 'x' }] }], staff: [] } as unknown as Event;

describe('buildEventRecord', () => {
  it('holds the event, its audit rows oldest first without ids, and the packs that have something', () => {
    const record = buildEventRecord({
      eventId: 'ev1',
      event,
      audit: [
        { id: 'b', t: 20, uid: 'u', actor: 'a@x.org', action: 'event.end', eventId: 'ev1' },
        { id: 'a', t: 10, uid: 'u', actor: 'a@x.org', action: 'event.create', eventId: 'ev1' },
      ],
      packs: { mci: { patients: [] }, tak: null },
      exportedBy: 'a@x.org',
      now: Date.UTC(2026, 10, 23),
    });
    expect(record.format).toBe(EVENT_RECORD_FORMAT);
    expect(record.event).toMatchObject({ id: 'ev1', name: 'Big Game' });
    expect(record.event.calls[0].log).toHaveLength(1);
    expect(record.audit.map((r) => r.action)).toEqual(['event.create', 'event.end']);
    expect(record.audit[0]).not.toHaveProperty('id');
    expect(Object.keys(record.packs)).toEqual(['mci']);
    expect(record.exportedAt).toBe('2026-11-23T00:00:00.000Z');
  });
});

describe('eventRecordFileName', () => {
  it('makes a safe name with the date', () => {
    expect(eventRecordFileName('Game: A/B', 'ev1', Date.UTC(2026, 0, 2))).toBe('Game_ A_B_Record_2026-01-02.json');
    expect(eventRecordFileName(undefined, 'ev1', Date.UTC(2026, 0, 2))).toBe('ev1_Record_2026-01-02.json');
  });
});
