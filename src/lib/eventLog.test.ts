import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { addEventNote, eventLogRows, stripLogTime } from './eventLog';

const event = {
  staff: [{ id: 's1', team: 'Alpha', log: [{ timestamp: 1, message: '0900 - status changed to En Route' }] }],
  supervisor: [{ id: 'p1', team: 'S1', log: [{ timestamp: 3, message: '0902 - supervisor created' }] }],
  calls: [{ id: 'c1', order: 7, log: [{ timestamp: 2, message: '0901 - Call created' }, { timestamp: 4, message: '  ' }] }],
  eventLog: [{ timestamp: 5, message: '0903 - Gate B closed' }],
} as unknown as Event;

describe('event log', () => {
  it('gathers every team, supervisor, call and note entry, without their HHMM prefix', () => {
    const rows = eventLogRows(event);
    expect(rows.map((r) => [r.source, r.kind, r.text])).toEqual([
      ['Alpha', 'team', 'status changed to En Route'],
      ['S1', 'supervisor', 'supervisor created'],
      ['Call 7', 'call', 'Call created'],
      ['Note', 'note', 'Gate B closed'],
    ]);
  });

  it('appends a typed note with the time, and ignores a blank one', () => {
    const at = new Date(2026, 0, 1, 14, 5).getTime();
    expect(addEventNote(event, '  Rain starting ', at).eventLog?.at(-1)).toEqual({ timestamp: at, message: '1405 - Rain starting' });
    expect(addEventNote(event, '   ', at)).toEqual({});
    expect(stripLogTime('no time here')).toBe('no time here');
  });
});
