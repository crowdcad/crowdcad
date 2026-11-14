import { describe, expect, it } from 'vitest';
import type { Call, Event, EventEquipment, Staff } from '@/app/types';
import {
  assignEquipment,
  custodyOf,
  custodyRunStats,
  fleetOf,
  handOffEquipment,
  isDispatchable,
  moveEquipment,
  pickUpEquipment,
  releaseEquipment,
  returnAllFromUnit,
  returnEquipment,
  RETRIEVING_EQ,
  RETURNING_EQ,
  settleReturningUnits,
  unPickUpEquipment,
} from './equipmentCustody';

const T = 1_700_000_000_000;

const team = (name: string, over: Partial<Staff> = {}): Staff => ({ team: name, location: 'Gate A', status: 'Available', members: [], ...over });
const wheelchair = (over: Partial<EventEquipment> = {}): EventEquipment => ({
  id: 'eq1',
  name: 'Wheelchair 1',
  status: 'Available',
  location: 'Staging',
  defaultLocation: 'Staging',
  assignedTeam: null,
  ...over,
});
const call = (over: Partial<Call> = {}): Call => ({ id: 'c1', order: 1, status: 'On Scene', location: 'Section 104', assignedTeam: ['Team 1'], chiefComplaint: 'Ankle', ...over });

function event(over: Partial<Event> = {}): Event {
  return {
    staff: [team('Team 1', { status: 'On Scene' }), team('Team 2')],
    supervisor: [],
    calls: [call()],
    eventEquipment: [wheelchair()],
    ...over,
  } as unknown as Event;
}

describe('custodyOf', () => {
  it('derives custody for equipment saved before custody tracking', () => {
    const e = event();
    expect(custodyOf(wheelchair(), e)).toEqual({ phase: 'staged', holder: { kind: 'post', name: 'Staging' } });
    expect(custodyOf(wheelchair({ status: 'In Use', assignedTeam: 'Team 2' }), e).holder).toEqual({ kind: 'team', name: 'Team 2' });
    expect(custodyOf(wheelchair({ location: 'Team 1' }), e).phase).toBe('carried');
    expect(custodyOf(wheelchair({ status: 'In Clinic', location: 'Clinic' }), e)).toEqual({ phase: 'in_clinic', holder: { kind: 'clinic', name: 'Clinic' } });
  });
});

describe('a full run', () => {
  it('fetch, carry, hand off, return', () => {
    let e = event();
    const assigned = assignEquipment(e, { callId: 'c1', equipmentName: 'Wheelchair 1', unit: 'Team 2', t: T, callNumber: 1 })!;
    expect(assigned.staff.find((s) => s.team === 'Team 2')).toMatchObject({ status: RETRIEVING_EQ, location: 'Staging', originalPost: 'Gate A' });
    expect(assigned.eventEquipment[0]).toMatchObject({ phase: 'retrieving', holder: { kind: 'post', name: 'Staging' }, assignedTeam: 'Team 2', status: 'In Use' });
    const c = assigned.calls[0];
    expect(c.equipmentTeams).toEqual(['Team 2']);
    expect(c.equipment).toEqual(['Wheelchair 1']);
    expect(c.status).toBe('On Scene'); // other units on the call keep its status
    e = { ...e, ...assigned };

    let fleet = pickUpEquipment(fleetOf(e), e, 'Team 2', T + 1);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'carried', holder: { kind: 'team', name: 'Team 2' }, location: 'Team 2' });

    fleet = handOffEquipment(fleet, e, 'Team 2', 'Team 1', 'Section 104', T + 2);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'with_care_team', holder: { kind: 'team', name: 'Team 1' }, assignedTeam: 'Team 1' });

    // The call resolves without the clinic: the care team brings it back.
    fleet = releaseEquipment(fleet, e, ['Team 1'], T + 3);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'returning', holder: { kind: 'team', name: 'Team 1' } });
    expect(fleet.staff.find((s) => s.team === 'Team 1')).toMatchObject({ status: RETURNING_EQ, location: 'Staging' });

    fleet = returnAllFromUnit(fleet, e, 'Team 1', T + 4);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'staged', holder: { kind: 'post', name: 'Staging' }, status: 'Available', assignedTeam: null });
    expect(fleet.eventEquipment[0].custodyLog?.map((l) => l.phase)).toEqual(['retrieving', 'carried', 'with_care_team', 'returning', 'staged']);
  });

  it('goes to the clinic when the patient is delivered', () => {
    const e = event({ eventEquipment: [wheelchair({ phase: 'carried', holder: { kind: 'team', name: 'Team 1' }, status: 'In Use', assignedTeam: 'Team 1' })] });
    const fleet = releaseEquipment(fleetOf(e), e, ['Team 1'], T, 'North Clinic');
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'in_clinic', holder: { kind: 'clinic', name: 'North Clinic' }, status: 'In Clinic' });
    expect(fleet.staff[0].status).toBe('On Scene'); // the caller sets the unit's own status
    expect(isDispatchable(fleet.eventEquipment[0], e)).toBe(true);
  });

  it('a unit already holding the equipment goes straight to En Route Eq', () => {
    const e = event({ eventEquipment: [wheelchair({ phase: 'returning', holder: { kind: 'team', name: 'Team 2' }, status: 'In Use', assignedTeam: 'Team 2' })] });
    const out = assignEquipment(e, { callId: 'c1', equipmentName: 'Wheelchair 1', unit: 'Team 2', t: T })!;
    expect(out.staff.find((s) => s.team === 'Team 2')!.status).toBe('En Route Eq');
    expect(out.eventEquipment[0]).toMatchObject({ phase: 'carried', holder: { kind: 'team', name: 'Team 2' } });
  });

  it('picking up from a returning unit frees that unit', () => {
    const e = event({
      staff: [team('Team 1', { status: RETURNING_EQ }), team('Team 2')],
      eventEquipment: [wheelchair({ phase: 'returning', holder: { kind: 'team', name: 'Team 1' }, status: 'In Use', assignedTeam: 'Team 1' })],
    });
    const assigned = assignEquipment(e, { callId: 'c1', equipmentName: 'Wheelchair 1', unit: 'Team 2', t: T })!;
    expect(assigned.eventEquipment[0]).toMatchObject({ phase: 'retrieving', holder: { kind: 'team', name: 'Team 1' }, assignedTeam: 'Team 2' });
    const fleet = pickUpEquipment(assigned, e, 'Team 2', T + 1);
    expect(fleet.staff.find((s) => s.team === 'Team 1')!.status).toBe('Available');
  });

  it('equipment never picked up stays where it was when the unit leaves', () => {
    const e = event();
    const assigned = assignEquipment(e, { callId: 'c1', equipmentName: 'Wheelchair 1', unit: 'Team 2', t: T })!;
    const fleet = releaseEquipment(assigned, e, ['Team 2'], T + 1);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'staged', holder: { kind: 'post', name: 'Staging' }, assignedTeam: null });
    expect(fleet.staff.find((s) => s.team === 'Team 2')!.status).toBe(RETRIEVING_EQ); // the caller sets it
  });

  it('hand-off with no care team leaves it at the call', () => {
    const e = event({ eventEquipment: [wheelchair({ phase: 'carried', holder: { kind: 'team', name: 'Team 2' }, status: 'In Use', assignedTeam: 'Team 2' })] });
    const fleet = handOffEquipment(fleetOf(e), e, 'Team 2', null, 'Section 104', T);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'staged', holder: { kind: 'post', name: 'Section 104' } });
  });

  it('un-picking up sends it back to its staging location', () => {
    const e = event({ eventEquipment: [wheelchair({ phase: 'carried', holder: { kind: 'team', name: 'Team 2' }, status: 'In Use', assignedTeam: 'Team 2' })] });
    const fleet = unPickUpEquipment(fleetOf(e), e, 'Team 2', T);
    expect(fleet.eventEquipment[0]).toMatchObject({ phase: 'retrieving', holder: { kind: 'post', name: 'Staging' }, assignedTeam: 'Team 2' });
  });
});

describe('manual override', () => {
  const returning = () =>
    event({
      staff: [team('Team 1', { status: RETURNING_EQ }), team('Team 2')],
      eventEquipment: [wheelchair({ phase: 'returning', holder: { kind: 'team', name: 'Team 1' }, status: 'In Use', assignedTeam: 'Team 1' })],
    });

  it('moves to a unit, a clinic or a post', () => {
    const e = returning();
    expect(moveEquipment(fleetOf(e), e, 'Wheelchair 1', 'Team 2', T).eventEquipment[0]).toMatchObject({ phase: 'carried', holder: { kind: 'team', name: 'Team 2' } });
    expect(moveEquipment(fleetOf(e), e, 'Wheelchair 1', 'Clinic', T).eventEquipment[0]).toMatchObject({ phase: 'in_clinic' });
    const atGate = moveEquipment(fleetOf(e), e, 'Wheelchair 1', 'Gate B', T);
    expect(atGate.eventEquipment[0]).toMatchObject({ phase: 'staged', holder: { kind: 'post', name: 'Gate B' } });
    expect(atGate.eventEquipment[0].custodyLog?.at(-1)?.by).toBe('dispatcher');
    // Team 1 had nothing else to bring back.
    expect(atGate.staff[0].status).toBe('Available');
  });

  it('returns to staging, or to a chosen post', () => {
    const e = returning();
    expect(returnEquipment(fleetOf(e), e, 'Wheelchair 1', T).eventEquipment[0].location).toBe('Staging');
    expect(returnEquipment(fleetOf(e), e, 'Wheelchair 1', T, 'dispatcher', 'Gate C').eventEquipment[0].location).toBe('Gate C');
  });

  it('keeps a returning unit busy while it still holds something', () => {
    const e = returning();
    const fleet = settleReturningUnits(fleetOf(e), e, T);
    expect(fleet.staff[0].status).toBe(RETURNING_EQ);
  });
});

describe('custodyRunStats', () => {
  it('counts runs from pickup to return, ignoring the wait while it is fetched', () => {
    const post = { kind: 'post' as const, name: 'Staging' };
    const unit = { kind: 'team' as const, name: 'Team 1' };
    const log = [
      { t: 0, phase: 'retrieving' as const, holder: post, team: 'Team 1', by: 'status' as const },
      { t: 60_000, phase: 'carried' as const, holder: unit, by: 'status' as const },
      { t: 600_000, phase: 'returning' as const, holder: unit, by: 'status' as const },
      { t: 900_000, phase: 'staged' as const, holder: post, by: 'status' as const },
      { t: 1_000_000, phase: 'carried' as const, holder: unit, by: 'dispatcher' as const },
    ];
    expect(custodyRunStats(log, 1_100_000)).toEqual({ runs: 2, awayMs: 840_000 + 100_000 });
    expect(custodyRunStats(undefined, 0)).toEqual({ runs: 0, awayMs: 0 });
  });
});
