import type { Event, Staff, Supervisor } from '@/app/types';

/**
 * On a live-tracking (TAK) event a unit's Location is where it actually is
 * (D66): it is written by the tracking source, or by hand for a unit that
 * isn't connected. Nothing else moves it: being assigned to a call, a status
 * change, or a schedule change (which changes the unit's post, `originalPost`)
 * all leave Location as it was. This keeps every such write path as it is
 * for standard events and undoes only its Location change here.
 *
 * `allow` names units whose Location this write may change (a manual edit).
 */
export function keepTrackedLocations(current: Event, updates: Partial<Event>, allow: readonly string[] = []): Partial<Event> {
  if (current.mapMode !== 'tak' || (!updates.staff && !updates.supervisor)) return updates;
  const keep = <T extends Staff | Supervisor>(prev: readonly T[] | undefined, next: T[]): T[] => {
    const before = new Map((prev || []).map((u) => [u.team, u]));
    return next.map((unit) => {
      const old = before.get(unit.team);
      if (!old || unit.location === old.location || allow.includes(unit.team)) return unit;
      return { ...unit, location: old.location };
    });
  };
  return {
    ...updates,
    ...(updates.staff ? { staff: keep(current.staff, updates.staff) } : {}),
    ...(updates.supervisor ? { supervisor: keep(current.supervisor, updates.supervisor) } : {}),
  };
}
