import type { Event, Staff, Supervisor } from '@/app/types';
import { dbService } from '@/lib/services';

/**
 * Writes live location labels into units' Location (D65, D66), in a
 * transaction so concurrent dispatch edits are never overwritten. Every
 * connected unit is tracked whatever its status: a team on a call or in the
 * clinic still shows where it actually is, and its status is never changed.
 * A change applies only when the unit is still where the caller last saw it
 * (`from`). The unit's timer is left alone: it follows status.
 */
export interface AutoLocationChange {
  teamId: string;
  /** The Location the caller saw; the change is skipped if it differs now. */
  from: string;
  label: string;
}

type Unit = Staff | Supervisor;

function hhmm(d: Date): string {
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
}

export function applyChanges<T extends Unit>(units: T[], changes: AutoLocationChange[], now: Date): { units: T[]; applied: number } {
  let applied = 0;
  const byId = new Map(changes.map((c) => [c.teamId, c]));
  const out = units.map((u) => {
    const c = u.id ? byId.get(u.id) : undefined;
    if (!c || (u.location || '') !== c.from || u.location === c.label) return u;
    applied++;
    return {
      ...u,
      location: c.label,
      log: [...(u.log || []), { timestamp: now.getTime(), message: `${hhmm(now)} - Location changed to ${c.label}` }],
    };
  });
  return { units: out, applied };
}

/** Applies the changes that still hold; returns how many were written. */
export async function saveAutoLocations(eventId: string, changes: AutoLocationChange[]): Promise<number> {
  if (!changes.length) return 0;
  return dbService.runTransaction(async (tx) => {
    const snap = await tx.get<Event>('events', eventId);
    const event = snap.data;
    if (!event || event.mapMode !== 'tak' || event.ended) return 0;
    const now = new Date();
    const staff = applyChanges(event.staff ?? [], changes, now);
    const supervisor = applyChanges(event.supervisor ?? [], changes, now);
    if (!staff.applied && !supervisor.applied) return 0;
    tx.update('events', eventId, {
      ...(staff.applied ? { staff: staff.units } : {}),
      ...(supervisor.applied ? { supervisor: supervisor.units } : {}),
    });
    return staff.applied + supervisor.applied;
  });
}
