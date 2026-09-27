import type { Call, Event, Staff, Supervisor } from '@/app/types';

// Team/supervisor timers show time since the unit entered its current
// status (or moved to its current location). That moment is stored on the
// unit itself as `statusSince`, stamped centrally by the dispatch page's
// updateEvent whenever a write changes a unit's status or location — so it
// survives reloads no matter which code path made the change. Older events
// predating the field fall back to reconstructing it from logs.

type Unit = Pick<Staff, 'team' | 'status' | 'location' | 'log'> & { statusSince?: number };

const unitKey = (u: Pick<Unit, 'status' | 'location'>) => `${u.status}|${u.location}`;

function stampUnits<T extends Unit>(prev: readonly T[] | undefined, next: readonly T[], now: number): T[] {
  const before = new Map((prev || []).map(u => [u.team, u]));
  return next.map(unit => {
    const old = before.get(unit.team);
    const moved = !old || unitKey(old) !== unitKey(unit);
    // Keep an explicit statusSince the caller set; otherwise stamp on change,
    // and carry the previous value forward when nothing changed.
    if (unit.statusSince !== undefined && unit.statusSince !== old?.statusSince) return unit;
    if (moved) return { ...unit, statusSince: now };
    if (unit.statusSince === undefined && old?.statusSince !== undefined) return { ...unit, statusSince: old.statusSince };
    return unit;
  });
}

/** Adds `statusSince` to any staff/supervisor in `updates` whose status or location differs from `current`. */
export function stampStatusSince(current: Event, updates: Partial<Event>, now: number = Date.now()): Partial<Event> {
  if (!updates.staff && !updates.supervisor) return updates;
  return {
    ...updates,
    ...(updates.staff ? { staff: stampUnits<Staff>(current.staff, updates.staff, now) } : {}),
    ...(updates.supervisor ? { supervisor: stampUnits<Supervisor>(current.supervisor, updates.supervisor, now) } : {}),
  };
}

/**
 * Fallback for units without `statusSince` (events created before it
 * existed): the most recent log entry recording the unit's current status or
 * post, checking the unit's own log and then the logs of calls it's on.
 */
export function deriveStatusSinceFromLogs(unit: Unit, calls: readonly Call[] | undefined): number | null {
  const status = (unit.status || '').toLowerCase();
  const location = (unit.location || '').toLowerCase();

  for (let i = (unit.log?.length ?? 0) - 1; i >= 0; i--) {
    const { message = '', timestamp } = unit.log![i];
    const msg = message.toLowerCase();
    // "<team> set to <status>" (handleStatusChange) / "status changed to <status>" (supervisors, older entries)
    if ((msg.includes(`${unit.team.toLowerCase()} set to`) || msg.includes('status changed to')) && status && msg.includes(status)) {
      return timestamp || null;
    }
    // Dispatch to a call logs "responding to call #N" and puts the unit En Route.
    if (status === 'en route' && msg.includes('responding to call')) return timestamp || null;
    if (msg.includes('post changed to') && location && msg.includes(location)) return timestamp || null;
  }

  // Call-row status changes (On Scene, Transporting, ...) are only logged on the call.
  let latest: number | null = null;
  const needle = `${unit.team} set to ${unit.status}`.toLowerCase();
  for (const call of calls || []) {
    if (!call.assignedTeam?.includes(unit.team)) continue;
    for (const entry of call.log || []) {
      if (entry.message?.toLowerCase().includes(needle) && (latest === null || entry.timestamp > latest)) {
        latest = entry.timestamp;
      }
    }
  }
  return latest;
}
