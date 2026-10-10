import { describe, expect, it } from 'vitest';
import type { TakDeviceLink, TakLivePosition } from '../data/takStore';
import { isStale, normalizeName, proposeAutoLinks, teamIdsOnCall, teamPositions, unassignedDevices, type TakTeam } from './linking';

const teams: TakTeam[] = [
  { id: 't1', name: 'Medic 1', kind: 'team' },
  { id: 't2', name: 'Medic 2', kind: 'team' },
  { id: 's1', name: 'Sup North', kind: 'supervisor' },
  { id: 'd1', name: 'Bike', kind: 'team' },
  { id: 'd2', name: 'bike', kind: 'team' }, // ambiguous with "Bike"
];
const pos = (deviceUid: string, callsign: string | undefined, receivedAt: number, lat = 45, lon = -100): TakLivePosition => ({
  deviceUid,
  callsign,
  lat,
  lon,
  deviceTime: receivedAt,
  receivedAt,
});
const link = (deviceUid: string, teamId: string): TakDeviceLink => ({ deviceUid, teamId, linkedAt: 1, method: 'manual', linkedBy: 'u' });

describe('normalizeName', () => {
  it('ignores case and whitespace', () => {
    expect(normalizeName('  Medic  1 ')).toBe('medic1');
    expect(normalizeName('MEDIC1')).toBe(normalizeName('medic 1'));
  });
});

describe('proposeAutoLinks', () => {
  it('links callsigns that match exactly one team name, ignoring case and spaces', () => {
    const live = [pos('A', 'medic1', 1), pos('B', 'SUP NORTH', 1), pos('C', 'Unknown', 1), pos('D', undefined, 1)];
    expect(proposeAutoLinks(live, [], teams, [])).toEqual([
      { deviceUid: 'A', teamId: 't1', method: 'auto', reason: 'callsign' },
      { deviceUid: 'B', teamId: 's1', method: 'auto', reason: 'callsign' },
    ]);
  });

  it('leaves ambiguous names for a dispatcher', () => {
    expect(proposeAutoLinks([pos('E', 'BIKE', 1)], [], teams, [])).toEqual([]);
  });

  it('prefers a remembered mapping over the callsign', () => {
    const live = [pos('A', 'Medic 1', 1)];
    expect(proposeAutoLinks(live, [], teams, [{ deviceUid: 'A', teamName: 'Medic 2' }])).toEqual([
      { deviceUid: 'A', teamId: 't2', method: 'auto', reason: 'remembered' },
    ]);
  });

  it('never relinks a device that already has a link', () => {
    expect(proposeAutoLinks([pos('A', 'Medic 1', 1)], [link('A', 't2')], teams, [])).toEqual([]);
  });

  it('falls back to the callsign when a remembered team no longer exists', () => {
    const out = proposeAutoLinks([pos('A', 'Medic 1', 1)], [], teams, [{ deviceUid: 'A', teamName: 'Old Team' }]);
    expect(out).toEqual([{ deviceUid: 'A', teamId: 't1', method: 'auto', reason: 'callsign' }]);
  });
});

describe('teamPositions', () => {
  it('uses the most recent fix among a team’s devices', () => {
    const live = [pos('A', 'Medic 1', 100, 45.1), pos('B', 'Medic 1 spare', 200, 45.2), pos('C', 'x', 300)];
    const out = teamPositions(live, [link('A', 't1'), link('B', 't1'), link('C', 'gone')], teams);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ team: { id: 't1' }, deviceCount: 2, position: { deviceUid: 'B', lat: 45.2 } });
  });

  it('credits a reassigned device to its new team only', () => {
    const live = [pos('A', 'x', 100)];
    const out = teamPositions(live, [link('A', 't2')], teams);
    expect(out.map((p) => p.team.id)).toEqual(['t2']);
  });
});

describe('unassignedDevices and staleness', () => {
  it('lists unlinked devices newest first', () => {
    const live = [pos('A', 'a', 100), pos('B', 'b', 300), pos('C', 'c', 200)];
    expect(unassignedDevices(live, [link('B', 't1')]).map((p) => p.deviceUid)).toEqual(['C', 'A']);
  });

  it('marks a fix stale after two minutes', () => {
    expect(isStale(pos('A', 'a', 0), 120_000)).toBe(false);
    expect(isStale(pos('A', 'a', 0), 120_001)).toBe(true);
  });
});

describe('teamIdsOnCall', () => {
  const call = (status: string, assignedTeam: string[]) => ({ id: status + assignedTeam.join(), order: 1, status, location: 'x', assignedTeam, chiefComplaint: 'private' });
  it('lists teams on open calls only, as sorted opaque ids', () => {
    const calls = [call('En Route', ['Medic 2', 'Sup North']), call('Resolved', ['Medic 1']), call('On Scene', ['Medic 2', 'Ghost Team'])];
    expect(teamIdsOnCall(calls, teams)).toEqual(['s1', 't2']);
  });
  it('carries nothing but ids', () => {
    const out = teamIdsOnCall([call('On Scene', ['Medic 1'])], teams);
    expect(JSON.stringify(out)).not.toContain('private');
  });
});
