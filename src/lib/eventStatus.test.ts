import { describe, expect, it } from 'vitest';
import type { Event } from '@/app/types';
import { getEventEndTime, getLastActivityTimestamp, getScheduleBounds, isEventEnded } from './eventStatus';
import { scheduleTimesToWindow } from './scheduleUtils';
import { Time } from '@internationalized/date';

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const HOUR = 60 * 60 * 1000;

const event = (over: Partial<Event>): Event =>
  ({ id: 'e', name: 'Fest', date: '2026-11-30T00:00:00.000Z', staff: [], supervisor: [], calls: [], ...over }) as Event;

describe('scheduleTimesToWindow', () => {
  it('puts From and To on the event day itself, wherever the user is', () => {
    expect(scheduleTimesToWindow('2026-11-30', new Time(16), new Time(22))).toEqual({ start: local(2026, 11, 30, 16), end: local(2026, 11, 30, 22) });
    expect(scheduleTimesToWindow('2026-11-30T00:00:00.000Z', new Time(16), new Time(2))).toEqual({ start: local(2026, 11, 30, 16), end: local(2026, 12, 1, 2) });
  });
});

describe('getScheduleBounds', () => {
  it('moves a window saved a day off onto the event day', () => {
    const e = event({ scheduleStart: local(2026, 11, 29, 16), scheduleEnd: local(2026, 11, 29, 22) });
    expect(getScheduleBounds(e)).toEqual({ start: local(2026, 11, 30, 16), end: local(2026, 11, 30, 22) });
    expect(getEventEndTime(e)).toBe(local(2026, 11, 30, 22));
  });

  it('leaves a correct window alone', () => {
    const e = event({ scheduleStart: local(2026, 11, 30, 16), scheduleEnd: local(2026, 12, 1, 2) });
    expect(getScheduleBounds(e)).toEqual({ start: local(2026, 11, 30, 16), end: local(2026, 12, 1, 2) });
  });
});

describe('isEventEnded', () => {
  it('does not end an event on its own day because its window was saved a day early', () => {
    const e = event({ createdAt: local(2026, 11, 20, 9), scheduleStart: local(2026, 11, 29, 16), scheduleEnd: local(2026, 11, 29, 22) });
    expect(isEventEnded(e, local(2026, 11, 30, 17))).toBe(false);
    expect(isEventEnded(e, local(2026, 11, 30, 23, 30))).toBe(true);
  });

  it('counts Log notes and equipment moves as activity', () => {
    const quiet = event({ scheduleStart: local(2026, 11, 30, 16), scheduleEnd: local(2026, 11, 30, 22), createdAt: local(2026, 11, 30, 15) });
    const note = { ...quiet, eventLog: [{ timestamp: local(2026, 11, 30, 22, 40), message: '2240 - still open' }] };
    expect(getLastActivityTimestamp(note)).toBe(local(2026, 11, 30, 22, 40));
    expect(isEventEnded(quiet, local(2026, 11, 30, 23))).toBe(true);
    expect(isEventEnded(note, local(2026, 11, 30, 23))).toBe(false);
    expect(isEventEnded(note, local(2026, 11, 30, 22, 40) + HOUR)).toBe(true);
  });

  it('never ends an event with no end time unless it was ended', () => {
    expect(isEventEnded(event({}), local(2027, 1, 1, 0))).toBe(false);
    expect(isEventEnded(event({ ended: true }), local(2026, 11, 30, 0))).toBe(true);
  });
});
