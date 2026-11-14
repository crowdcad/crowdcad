import { describe, expect, it } from 'vitest';
import type { Event, IncomingTeam, MciState } from '@/app/types';
import {
  addHospital,
  addIncoming,
  arriveIncoming,
  cancelIncoming,
  etaLabel,
  giveEquipment,
  takeBackEquipment,
  undoIncoming,
  isOverdue,
  logisticsCsvLines,
  normalizeEtaTime,
  hospitalSentCounts,
  hospitalSentTotal,
  sortIncoming,
  updateHospital,
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

describe('undoing an arrival or a cancellation (D28)', () => {
  const arrived = () => {
    let e = event({ calls: [] } as Partial<Event>);
    e = apply(e, addIncoming(e, { name: 'Bravo' }, 100, 'i1').patch);
    return apply(e, arriveIncoming(e, 'i1', 200).patch);
  };

  it('takes the team off the board and puts the row back on the list', () => {
    let e = arrived();
    expect(e.mci!.logistics!.incoming[0]!.teamId).toBe(e.staff[0]!.id);
    e = apply(e, undoIncoming(e, 'i1').patch);
    expect(e.staff).toEqual([]);
    expect(e.mci!.logistics!.incoming[0]).toEqual(expect.objectContaining({ state: 'incoming' }));
    expect(e.mci!.logistics!.incoming[0]).not.toHaveProperty('closedAt');
    expect(e.mci!.logistics!.incoming[0]).not.toHaveProperty('teamId');
  });

  it('refuses once the team is working or holds equipment', () => {
    const e = arrived();
    const busy = { ...e, staff: [{ ...e.staff[0]!, status: 'En Route' }] } as Event;
    expect(undoIncoming(busy, 'i1').error).toBe('busy');
    const holding = { ...e, eventEquipment: [{ id: 'q', name: 'AED', status: 'In Use', location: 'Bravo', assignedTeam: 'Bravo' }] } as Event;
    expect(undoIncoming(holding, 'i1').error).toBe('busy');
  });

  it('brings back a cancelled row, unless the name is taken again', () => {
    let e = event();
    e = apply(e, addIncoming(e, { name: 'Bravo' }, 100, 'i1').patch);
    e = apply(e, cancelIncoming(e, 'i1', 200).patch);
    const again = apply(e, addIncoming(e, { name: 'Bravo' }, 300, 'i2').patch);
    expect(undoIncoming(again, 'i1').error).toBe('duplicate');
    e = apply(e, undoIncoming(e, 'i1').patch);
    expect(e.mci!.logistics!.incoming[0]!.state).toBe('incoming');
  });
});

describe('handing out equipment (D27)', () => {
  const teams = (over: Partial<Event> = {}) =>
    event({
      staff: [
        { id: 'a', team: 'Alpha', location: '', status: 'Available', members: [] },
        { id: 'b', team: 'MRC1', location: '', status: 'Available', members: [] },
      ],
      ...over,
    } as Partial<Event>);
  const holderOf = (e: Event, name: string) => e.eventEquipment!.find((x) => x.name === name)?.holder;

  it('makes the item when there is none, and the team holds it', () => {
    let e = teams();
    e = apply(e, giveEquipment(e, { item: 'Trauma bag', unit: 'MRC1' }, 100, 'q1').patch);
    expect(e.eventEquipment).toHaveLength(1);
    expect(e.eventEquipment![0]).toMatchObject({ id: 'q1', name: 'Trauma bag', phase: 'carried', assignedTeam: 'MRC1', location: 'MRC1' });
    expect(e.staff[1]!.log?.at(-1)?.message).toMatch(/given Trauma bag \(logistics\)$/);
  });

  it('hands over a free item of that kind before making another, numbering new ones', () => {
    let e = teams({ eventEquipment: [{ id: 'v', name: 'Triage Bag 1', status: 'Available', location: 'Staging', assignedTeam: null }] } as Partial<Event>);
    e = apply(e, giveEquipment(e, { item: 'Triage bag', unit: 'Alpha' }, 100, 'q1').patch);
    expect(holderOf(e, 'Triage Bag 1')).toEqual({ kind: 'team', name: 'Alpha' });
    e = apply(e, giveEquipment(e, { item: 'Triage bag', unit: 'MRC1' }, 200, 'q2').patch);
    e = apply(e, giveEquipment(e, { item: 'Triage bag', unit: 'MRC1' }, 300, 'q3').patch);
    expect(e.eventEquipment!.map((x) => x.name)).toEqual(['Triage Bag 1', 'Triage bag', 'Triage bag 2']);
    // A trauma bag is a different item.
    e = apply(e, giveEquipment(e, { item: 'Trauma bag', unit: 'MRC1' }, 400, 'q4').patch);
    expect(holderOf(e, 'Trauma bag')).toEqual({ kind: 'team', name: 'MRC1' });
  });

  it('transfers one item exactly, and takes it back to staging', () => {
    let e = teams();
    e = apply(e, giveEquipment(e, { item: 'AED', unit: 'Alpha' }, 100, 'q1').patch);
    e = apply(e, giveEquipment(e, { item: 'AED', unit: 'MRC1', exact: true }, 200).patch);
    expect(e.eventEquipment).toHaveLength(1);
    expect(holderOf(e, 'AED')).toEqual({ kind: 'team', name: 'MRC1' });
    e = apply(e, takeBackEquipment(e, 'AED', 300).patch);
    expect(e.eventEquipment![0]).toMatchObject({ phase: 'staged', status: 'Available', assignedTeam: null });
    expect(giveEquipment(e, { item: 'Gone', unit: 'MRC1', exact: true }, 400).error).toBe('missing');
  });

  it('writes out the venue catalog with the change, and refuses an unknown team or empty item', () => {
    const e = teams({ venue: { equipment: ['Wheelchair 1', 'Gurney'] } } as unknown as Partial<Event>);
    const out = giveEquipment(e, { item: 'Wheelchair', unit: 'Alpha' }, 100, 'q1');
    expect(out.patch.eventEquipment!.map((x) => [x.name, x.holder?.name ?? x.location])).toEqual([['Wheelchair 1', 'Alpha'], ['Gurney', 'Staging']]);
    expect(giveEquipment(e, { item: 'AED', unit: 'Nobody' }, 100).error).toBe('no-team');
    expect(giveEquipment(e, { item: ' ', unit: 'Alpha' }, 100).error).toBe('invalid');
    expect(giveEquipment(event({ mci: mci({ active: false }) }), { item: 'AED', unit: 'Alpha' }, 100).error).toBe('inactive');
  });
});

describe('hospitals', () => {
  const withHospital = () => {
    const e = event({ mci: mci({ areas: [{ id: 'c1', name: 'Clinic' }] }) });
    return apply(e, addHospital(e, '  General  ', 10, 'h1').patch);
  };

  it('adds hospitals by unique name and sets capacity', () => {
    let e = withHospital();
    expect(e.mci!.logistics!.hospitals).toEqual([{ id: 'h1', name: 'General' }]);
    expect(addHospital(e, 'general', 11).error).toBe('duplicate');
    expect(addHospital(e, ' ', 11).error).toBe('invalid');
    e = apply(e, updateHospital(e, 'h1', { capacity: 8 }).patch);
    expect(e.mci!.logistics!.hospitals![0].capacity).toBe(8);
    e = apply(e, updateHospital(e, 'h1', { capacity: null }).patch);
    expect(e.mci!.logistics!.hospitals![0].capacity).toBeUndefined();
    expect(updateHospital(e, 'h1', { capacity: -1 }).error).toBe('invalid');
  });

  it('counts patients sent from transports to the hospital, by color, and keeps a typed correction', () => {
    let e = withHospital();
    const log = [
      { id: 'a1', t: 20, kind: 'arrived' as const, areaId: 'c1', color: 'red' as const, n: 2 },
      { id: 'a2', t: 21, kind: 'arrived' as const, areaId: 'c1', color: 'yellow' as const, n: 1 },
      { id: 't1', t: 30, kind: 'transported' as const, areaId: 'c1', color: 'red' as const, n: 2, unit: 'A1', destination: 'general' },
      { id: 't2', t: 31, kind: 'transported' as const, areaId: 'c1', color: 'yellow' as const, n: 1, unit: 'A2', destination: 'Other' },
    ];
    e = { ...e, mci: { ...e.mci!, log } } as Event;
    const counted = hospitalSentCounts(e.mci).get('h1')!;
    expect(counted).toMatchObject({ red: 2, yellow: 0, green: 0 });
    expect(hospitalSentTotal(e.mci!.logistics!.hospitals![0], counted)).toBe(2);
    e = apply(e, updateHospital(e, 'h1', { sent: 3 }).patch);
    expect(hospitalSentTotal(e.mci!.logistics!.hospitals![0], counted)).toBe(3);
    // Typing the counted number back clears the correction.
    e = apply(e, updateHospital(e, 'h1', { sent: 2 }).patch);
    expect(e.mci!.logistics!.hospitals![0].sentAdjust).toBeUndefined();
  });
});
