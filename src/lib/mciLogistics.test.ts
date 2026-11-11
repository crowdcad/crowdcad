import { describe, expect, it } from 'vitest';
import type { Event, IncomingTeam, MciState } from '@/app/types';
import {
  addIncoming,
  arriveIncoming,
  cancelIncoming,
  etaLabel,
  isOverdue,
  logisticsCsvLines,
  normalizeEtaTime,
  sortIncoming,
  updateIncoming,
} from './mciLogistics';

const mci = (over: Partial<MciState> = {}): MciState => ({ active: true, periods: [{ startedAt: 1 }], zones: [], areas: [], log: [], ...over });
const event = (over: Partial<Event> = {}) => ({ staff: [], supervisor: [], mci: mci(), ...over }) as unknown as Event;
const apply = (e: Event, patch: Partial<Event>) => ({ ...e, ...patch }) as Event;
const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m);

describe('ETA', () => {
  it('normalizes typed times', () => {
    expect(normalizeEtaTime('0930')).toBe('09:30');
    expect(normalizeEtaTime('9:30')).toBe('09:30');
    expect(normalizeEtaTime('23:59')).toBe('23:59');
    expect(normalizeEtaTime('24:00')).toBeNull();
    expect(normalizeEtaTime('soon')).toBeNull();
  });

  it('labels and flags overdue times, treating far-back times as tomorrow', () => {
    expect(etaLabel({ kind: 'en_route' })).toBe('En route');
    expect(isOverdue({ kind: 'time', time: '09:00' }, at(9, 30))).toBe(true);
    expect(isOverdue({ kind: 'time', time: '10:00' }, at(9, 30))).toBe(false);
    expect(isOverdue({ kind: 'time', time: '00:30' }, at(23, 0))).toBe(false);
    expect(isOverdue({ kind: 'pending' }, at(9))).toBe(false);
  });

  it('sorts clock times soonest first (overdue first), then en route, pending, attempted', () => {
    const t = (id: string, eta: IncomingTeam['eta']): IncomingTeam => ({ id, name: id, members: [], eta, notes: '', reportedAt: 0, state: 'incoming' });
    const sorted = sortIncoming(
      [t('p', { kind: 'pending' }), t('late', { kind: 'time', time: '09:00' }), t('a', { kind: 'attempted' }), t('soon', { kind: 'time', time: '10:00' }), t('e', { kind: 'en_route' })],
      at(9, 30),
    );
    expect(sorted.map((x) => x.id)).toEqual(['late', 'soon', 'e', 'p', 'a']);
  });
});

describe('incoming teams', () => {
  it('adds, edits, and refuses a duplicate or empty name', () => {
    let e = event({ staff: [{ team: 'Alpha', location: '', status: 'Available', members: [] }] } as Partial<Event>);
    e = apply(e, addIncoming(e, { name: ' Bravo ', members: ['Sam [EMT]'], notes: 'from Station 4' }, 100, 'i1').patch);
    expect(e.mci?.logistics?.incoming[0]).toMatchObject({ id: 'i1', name: 'Bravo', eta: { kind: 'pending' }, notes: 'from Station 4', state: 'incoming' });
    expect(addIncoming(e, { name: 'alpha' }, 101).error).toBe('duplicate');
    expect(addIncoming(e, { name: 'bravo' }, 101).error).toBe('duplicate');
    expect(addIncoming(e, { name: ' ' }, 101).error).toBe('invalid');
    e = apply(e, updateIncoming(e, 'i1', { eta: { kind: 'time', time: '10:15' }, notes: 'two medics' }).patch);
    expect(e.mci?.logistics?.incoming[0]).toMatchObject({ eta: { kind: 'time', time: '10:15' }, notes: 'two medics' });
  });

  it('arrival makes an Available team with a log line and closes the row', () => {
    let e = event();
    e = apply(e, addIncoming(e, { name: 'Bravo', members: ['Sam [EMT]'], notes: 'Station 4' }, 100, 'i1').patch);
    e = apply(e, arriveIncoming(e, 'i1', Date.parse('2026-11-11T10:05:00')).patch);
    expect(e.staff[0]).toMatchObject({ team: 'Bravo', members: ['Sam [EMT]'], status: 'Available' });
    expect(e.staff[0]!.log?.[0]?.message).toMatch(/arrived \(MCI logistics\): Station 4$/);
    expect(e.mci?.logistics?.incoming[0]).toMatchObject({ state: 'arrived' });
    // Not twice.
    expect(arriveIncoming(e, 'i1', 200).error).toBe('missing');
  });

  it('cancels, keeping the row for the summary and CSV', () => {
    let e = event();
    e = apply(e, addIncoming(e, { name: 'Bravo' }, 100, 'i1').patch);
    e = apply(e, cancelIncoming(e, 'i1', 200).patch);
    expect(e.mci?.logistics?.incoming[0]).toMatchObject({ state: 'cancelled', closedAt: 200 });
    expect(logisticsCsvLines(e, (ms) => String(ms))).toEqual([
      'Logistics,"Bravo",100,"reported on the way, ETA Pending"',
      'Logistics,"Bravo",200,"cancelled"',
    ]);
  });

  it('does nothing after stand down', () => {
    expect(addIncoming(event({ mci: mci({ active: false }) }), { name: 'X' }, 1).error).toBe('inactive');
  });
});
