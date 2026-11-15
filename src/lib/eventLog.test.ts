import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { ALL_EVENT_LOG, eventLogRows, filterEventLog, parseLogSearch, stripLogTime } from './eventLog';

const at = (h: number, m: number) => new Date(2026, 0, 1, h, m).getTime();
const event = {
  staff: [{ id: 's1', team: 'Alpha', log: [{ timestamp: at(9, 0), message: '0900 - status changed to En Route' }] }],
  supervisor: [{ id: 'p1', team: 'S1', log: [{ timestamp: at(9, 2), message: '0902 - supervisor created' }] }],
  calls: [{ id: 'c1', order: 7, log: [{ timestamp: at(9, 1), message: '0901 - Call created' }, { timestamp: at(9, 3), message: '  ' }] }],
  eventLog: [{ timestamp: at(14, 5), message: '1405 - Gate B closed' }],
} as unknown as Event;
const clock = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

describe('event log', () => {
  it('gathers every team, supervisor, call and note entry, without their HHMM prefix', () => {
    const rows = eventLogRows(event);
    expect(rows.map((r) => [r.source, r.kind, r.text])).toEqual([
      ['Alpha', 'team', 'status changed to En Route'],
      ['S1', 'supervisor', 'supervisor created'],
      ['Call 7', 'call', 'Call created'],
      ['Note', 'note', 'Gate B closed'],
    ]);
    expect(stripLogTime('no time here')).toBe('no time here');
  });

  it('reads a time range and keywords from a search', () => {
    expect(parseLogSearch('14:00-15:30 gate')).toEqual({ from: 840, to: 930, words: ['gate'] });
    expect(parseLogSearch('0900 to 0901')).toEqual({ from: 540, to: 541, words: [] });
    expect(parseLogSearch('Alpha  En')).toEqual({ words: ['alpha', 'en'] });
  });

  it('filters by kind, recent window, time range and every keyword', () => {
    const rows = eventLogRows(event);
    const sources = (r: ReturnType<typeof eventLogRows>) => r.map((x) => x.source);
    expect(sources(filterEventLog(rows, ALL_EVENT_LOG, '9:00-9:01', at(15, 0), clock))).toEqual(['Alpha', 'Call 7']);
    expect(sources(filterEventLog(rows, ALL_EVENT_LOG, 'created call', at(15, 0), clock))).toEqual(['Call 7']);
    expect(sources(filterEventLog(rows, { kinds: ['team', 'note'], windowMinutes: 0 }, '', at(15, 0), clock))).toEqual(['Alpha', 'Note']);
    expect(sources(filterEventLog(rows, { ...ALL_EVENT_LOG, windowMinutes: 60 }, '', at(15, 0), clock))).toEqual(['Note']);
    // The shown time is searchable too.
    expect(sources(filterEventLog(rows, ALL_EVENT_LOG, '14:05', at(15, 0), clock))).toEqual(['Note']);
  });
});
