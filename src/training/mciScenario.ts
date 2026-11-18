import type { Event, MciColor } from '@/app/types';
import { declareMci, deriveMci } from '@/lib/mci';
import { applyRoleAction, type RoleAction } from '@/lib/mciRoleActions';
import type { EventRole } from '@/lib/roleAccounts';
import { getVenueZones } from '@/lib/zones';
import { CLINICS, POSTS, trainingBoardAfter } from './fixtures';

/**
 * The MCI already under way that the role modules start from, played out with the same role actions the
 * role logins send (applyRoleAction): a railing collapse near Sather Gate. Zones Glade, Campanile and South
 * Zone; the three clinics as treatment locations; MRC1 triaging the South Zone; MRC2 treating in the Dwinelle
 * Tent with three patients there; two hospitals; one team on its way; MRC1 holding a triage bag.
 */

export const MCI_ZONE = 'South Zone';
export const MCI_AREA = POSTS.clinic;
export const HOSPITALS = ['County General', 'Alta Bates'] as const;
export const INCOMING_TEAM = 'Medic 12';

/** Applies a role login's action; a scenario that fails to apply is a bug in this file, so it throws. */
export function asRole(event: Event, role: EventRole, unit: string, action: RoleAction, now = Date.now()): Event {
  const unitId = [...(event.staff || []), ...(event.supervisor || [])].find((u) => u.team === unit)?.id;
  let seq = 0;
  const out = applyRoleAction(event, action, { uid: 'practice', role, unitName: unit, unitId }, now, () => `p${now.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  if (out.error) throw new Error(`training MCI scenario: ${action.type} as ${unit}: ${out.error}`);
  return { ...event, ...out.patch };
}

export const zoneIdOf = (e: Event, name: string) => e.mci?.zones.find((z) => z.name === name)?.id ?? '';
export const areaIdOf = (e: Event, name: string) => e.mci?.areas.find((a) => a.name === name)?.id ?? '';
export const zoneStatsOf = (e: Event, name: string) => deriveMci(e).zones.find((z) => z.zone.name === name);
export const areaStatsOf = (e: Event, name: string) => deriveMci(e).areas.find((a) => a.name === name);
export const unitOf = (e: Event, name: string) => [...(e.staff || []), ...(e.supervisor || [])].find((u) => u.team === name);

const PATIENTS: { color: MciColor; age: string; sex: string; complaint: string }[] = [
  { color: 'red', age: '54', sex: 'M', complaint: 'Fall, chest pain' },
  { color: 'red', age: '23', sex: 'F', complaint: 'Open leg fracture' },
  { color: 'yellow', age: '31', sex: 'M', complaint: 'Head laceration' },
];

/** The scenario, played onto a fresh practice board. */
export function mciUnderWay(event: Event): Event {
  const t = Date.now() - 12 * 60 * 1000;
  const zones = getVenueZones(event.venue).map((z) => ({ id: z.id, name: z.name, venueZoneId: z.id }));
  let e: Event = { ...event, ...declareMci(event, { zones, areas: CLINICS.map((c) => ({ id: c.id, name: c.name, clinicId: c.id })), trackPatients: true }, t) };
  const zone = zoneIdOf(e, MCI_ZONE);
  const area = areaIdOf(e, MCI_AREA);
  e = asRole(e, 'responder', 'MRC1', { type: 'assign', assignment: { kind: 'zone', id: zone } }, t + 30_000);
  e = asRole(e, 'responder', 'MRC1', { type: 'counts', zoneId: zone, deltas: { red: 3, yellow: 2, green: 4 } }, t + 60_000);
  e = asRole(e, 'responder', 'MRC1', { type: 'move', zoneId: zone, areaId: area, counts: { red: 2, yellow: 1 } }, t + 120_000);
  e = asRole(e, 'responder', 'MRC2', { type: 'assign', assignment: { kind: 'area', id: area } }, t + 150_000);
  const moved = areaStatsOf(e, MCI_AREA)?.patients ?? [];
  PATIENTS.forEach((p, i) => {
    const patient = moved.filter((m) => m.color === p.color)[i === 2 ? 0 : i];
    if (patient) e = asRole(e, 'responder', 'MRC2', { type: 'patientDetails', patientId: patient.id, fields: { age: p.age, sex: p.sex, complaint: p.complaint, team: 'MRC1' } }, t + 180_000 + i * 1000);
  });
  for (const name of HOSPITALS) e = asRole(e, 'logistics', 'Sup 1', { type: 'hospitalAdd', name }, t + 200_000);
  const county = e.mci?.logistics?.hospitals?.find((h) => h.name === HOSPITALS[0]);
  if (county) e = asRole(e, 'logistics', 'Sup 1', { type: 'hospitalUpdate', id: county.id, capacity: 4 }, t + 205_000);
  e = asRole(e, 'logistics', 'Sup 1', { type: 'incomingAdd', name: INCOMING_TEAM, eta: { kind: 'en_route' } }, t + 210_000);
  e = asRole(e, 'logistics', 'Sup 1', { type: 'equipmentGive', item: 'Triage bag', unit: 'MRC1' }, t + 220_000);
  return e;
}

/** A role module's starting board: the MCI under way. */
export const mciRoleBoard = (moduleId: string) => trainingBoardAfter(moduleId, mciUnderWay);
