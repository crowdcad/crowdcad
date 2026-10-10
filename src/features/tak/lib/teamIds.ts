import type { Event, Staff, Supervisor } from '@/app/types';
import { dbService } from '@/lib/services';
import { newTeamId } from '@/lib/teamId';
import type { TakTeam } from './linking';

/**
 * Team-id backfill for TAK events only. Teams created before team ids
 * existed get one, in a single event write; standard events are never
 * touched.
 */
export function withTeamIds<T extends { id?: string }>(teams: T[]): { teams: T[]; changed: boolean } {
  let changed = false;
  const out = teams.map((t) => {
    if (t.id) return t;
    changed = true;
    return { ...t, id: newTeamId() };
  });
  return { teams: out, changed };
}

/** TAK's view of an event's teams (only those with ids). */
export function takTeams(staff: Staff[] = [], supervisor: Supervisor[] = []): TakTeam[] {
  return [
    ...staff.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.team, kind: 'team' as const })),
    ...supervisor.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.team, kind: 'supervisor' as const })),
  ];
}

/**
 * Gives every team on a TAK event an id, in a transaction so it never
 * overwrites concurrent dispatch edits. Returns true if anything changed.
 */
export async function ensureTeamIds(eventId: string): Promise<boolean> {
  return dbService.runTransaction(async (tx) => {
    const snap = await tx.get<Event>('events', eventId);
    const event = snap.data;
    if (!event || event.mapMode !== 'tak') return false;
    const staff = withTeamIds(event.staff ?? []);
    const supervisor = withTeamIds(event.supervisor ?? []);
    if (!staff.changed && !supervisor.changed) return false;
    tx.update('events', eventId, {
      ...(staff.changed ? { staff: staff.teams } : {}),
      ...(supervisor.changed ? { supervisor: supervisor.teams } : {}),
    });
    return true;
  });
}
