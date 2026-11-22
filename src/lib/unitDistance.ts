/**
 * Where a call and the units that could take it are, and how far apart: for the call's Add Team / Add
 * Supervisor lists. A unit's place is its live position when it is tracked (UnitTracking, from an extension
 * pack), else the venue location in its Location field; a call's is its dropped pin, else its
 * location's. Only places with coordinates (geo layers, or posts with lat/lng) give a distance.
 */
import type { Call, Event, Layer } from '@/app/types';
import { distanceM } from '@/lib/geo/distance';
import { postLatLng } from '@/lib/geo/positions';
import type { LatLon } from '@/lib/geo/types';
import type { UnitTracking } from '@/lib/unitTracking';
import { RESOLVED_CALL_STATUSES } from '@/lib/clinics';

/** The coordinates of a venue location by name, from the first layer that places it. */
export function placePoint(name: string | undefined, layers: Layer[]): LatLon | null {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  for (const layer of layers) {
    for (const post of layer.posts ?? []) {
      if (typeof post === 'string' || post.name.trim().toLowerCase() !== wanted) continue;
      const p = postLatLng(post, layer);
      if (p) return { lat: p.lat, lon: p.lng };
    }
  }
  return null;
}

/** Where a call is: its dropped pin, else its location's coordinates. */
export function callPoint(call: Pick<Call, 'location' | 'locationPoint'>, layers: Layer[]): LatLon | null {
  if (call.locationPoint) return { lat: call.locationPoint.lat, lon: call.locationPoint.lng };
  return placePoint(call.location, layers);
}

export interface UnitOption {
  name: string;
  /** How the list names it: the team, or a supervisor's member and team ("Kim (Sup 1)"). */
  label: string;
  kind: 'team' | 'supervisor';
  status: string;
  /** What the unit's Location field says (a tracked unit's is written from its position). */
  location: string;
  /** Meters to the call, when both places have coordinates. */
  distance?: number;
  /** The distance comes from a live position. */
  live: boolean;
  /** In Clinic or On Break: can be sent, shown after the available units. */
  inactive: boolean;
}

const FREE = ['Available'];
const INACTIVE = ['In Clinic', 'On Break'];

/**
 * The teams (or supervisors) free to send to a call, with where they are and how far: units on no active call
 * with status Available, then In Clinic / On Break. Each group is nearest first; units without a distance keep
 * their board order after the ones with one.
 */
export function unitOptions(
  event: Pick<Event, 'staff' | 'supervisor' | 'calls'>,
  call: Pick<Call, 'id' | 'location' | 'locationPoint' | 'assignedTeam'>,
  kind: 'team' | 'supervisor',
  layers: Layer[],
  tracking: UnitTracking | null | undefined
): UnitOption[] {
  const units = (kind === 'team' ? event.staff : event.supervisor) ?? [];
  const busy = new Set(
    (event.calls ?? []).filter((c) => !RESOLVED_CALL_STATUSES.includes(c.status) && c.status !== 'Resolved').flatMap((c) => c.assignedTeam ?? [])
  );
  const target = callPoint(call, layers);
  const options: UnitOption[] = [];
  for (const u of units) {
    if (busy.has(u.team) || call.assignedTeam?.includes(u.team)) continue;
    const free = FREE.includes(u.status);
    const inactive = INACTIVE.includes(u.status);
    if (!free && !inactive) continue;
    const livePos = tracking?.positions[u.team];
    const at = livePos && !livePos.stale ? { lat: livePos.lat, lon: livePos.lon } : placePoint(u.location, layers);
    const member = kind === 'supervisor' ? ((u as { member?: string }).member ?? '') : '';
    const memberName = member.match(/^(.+?)\s\[(.+?)\]/)?.[1] ?? member;
    options.push({
      name: u.team,
      label: kind === 'supervisor' && memberName ? `${memberName} (${u.team})` : u.team,
      kind,
      status: u.status,
      location: u.location ?? '',
      ...(target && at ? { distance: distanceM(target, at) } : {}),
      live: !!(livePos && !livePos.stale),
      inactive,
    });
  }
  const byDistance = (a: UnitOption, b: UnitOption) =>
    a.distance === undefined ? (b.distance === undefined ? 0 : 1) : b.distance === undefined ? -1 : a.distance - b.distance;
  return [...options.filter((o) => !o.inactive).sort(byDistance), ...options.filter((o) => o.inactive).sort(byDistance)];
}
