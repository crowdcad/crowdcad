import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Staff, Supervisor } from '@/app/types';

const mocks = vi.hoisted(() => ({
  event: null as Partial<Event> | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/services', () => ({
  isPocketbaseBackend: false,
  dbService: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ id: 'E1', exists: !!mocks.event, data: mocks.event }),
        update: (_c: string, _id: string, data: Record<string, unknown>) => mocks.updates.push(data),
      }),
  },
}));

const { ensureTeamIds, takTeams, withTeamIds } = await import('./teamIds');

const staff = (team: string, id?: string): Staff => ({ team, location: 'Gate A', status: 'Available', members: ['A [EMT]'], ...(id ? { id } : {}) });
const sup = (team: string, id?: string): Supervisor => ({ team, location: 'Roaming', status: 'Available', member: 'B [RN]', ...(id ? { id } : {}) });

beforeEach(() => {
  mocks.event = null;
  mocks.updates = [];
});

describe('withTeamIds', () => {
  it('adds ids only where missing and keeps every other field', () => {
    const input = [staff('Medic 1', 'keep-me'), staff('Medic 2')];
    const { teams, changed } = withTeamIds(input);
    expect(changed).toBe(true);
    expect(teams[0]).toBe(input[0]);
    expect(teams[1]).toMatchObject({ team: 'Medic 2', location: 'Gate A', status: 'Available', members: ['A [EMT]'] });
    expect(typeof teams[1]!.id).toBe('string');
  });

  it('reports no change when every team has an id', () => {
    expect(withTeamIds([staff('Medic 1', 'x')]).changed).toBe(false);
  });
});

describe('ensureTeamIds', () => {
  it('backfills ids on a TAK event in one write', async () => {
    mocks.event = { mapMode: 'tak', staff: [staff('Medic 1'), staff('Medic 2', 'kept')], supervisor: [sup('Sup')] };
    expect(await ensureTeamIds('E1')).toBe(true);
    expect(mocks.updates).toHaveLength(1);
    const u = mocks.updates[0] as { staff: Staff[]; supervisor: Supervisor[] };
    expect(u.staff.every((s) => s.id)).toBe(true);
    expect(u.staff[1]!.id).toBe('kept');
    expect(u.supervisor[0]!.id).toBeTruthy();
  });

  it('never touches a standard event', async () => {
    mocks.event = { staff: [staff('Medic 1')], supervisor: [] };
    expect(await ensureTeamIds('E1')).toBe(false);
    mocks.event = { mapMode: 'standard', staff: [staff('Medic 1')], supervisor: [] };
    expect(await ensureTeamIds('E1')).toBe(false);
    expect(mocks.updates).toEqual([]);
  });

  it('does nothing when all teams already have ids', async () => {
    mocks.event = { mapMode: 'tak', staff: [staff('Medic 1', 'a')], supervisor: [sup('Sup', 'b')] };
    expect(await ensureTeamIds('E1')).toBe(false);
    expect(mocks.updates).toEqual([]);
  });
});

describe('takTeams', () => {
  it('includes only teams with ids, by name and kind', () => {
    expect(takTeams([staff('Medic 1', 'a'), staff('No Id')], [sup('Sup', 'b')])).toEqual([
      { id: 'a', name: 'Medic 1', kind: 'team' },
      { id: 'b', name: 'Sup', kind: 'supervisor' },
    ]);
  });
});
