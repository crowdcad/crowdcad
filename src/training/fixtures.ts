import type { Call, EventEquipment, Post, Staff, Supervisor, Zone } from '@/app/types';
import type { LiteEventDraft } from '@/lib/liteEventStore';

/**
 * The boards training modules start from. Everything here is made up: the
 * festival, the people and the patients. Trainees only ever see and type
 * this script's text while a module is locked (src/training/gate.ts).
 */

export const TRAINING_EVENT_PREFIX = 'training-';

// A park-sized area for the live map (posts carry lat/lng). The basemap needs internet; nothing else does.
const CENTER = { lat: 37.7694, lng: -122.4862 };
const at = (dLat: number, dLng: number) => ({ lat: +(CENTER.lat + dLat).toFixed(6), lng: +(CENTER.lng + dLng).toFixed(6) });

export const AREA = [at(0.0032, -0.0052), at(0.0032, 0.0052), at(-0.0032, 0.0052), at(-0.0032, -0.0052)];

const post = (name: string, dLat: number, dLng: number, extra: Partial<Exclude<Post, string>> = {}): Post => ({
  name,
  x: null,
  y: null,
  ...at(dLat, dLng),
  ...extra,
});

export const POSTS = {
  mainStage: 'Main Stage',
  gateA: 'Gate A',
  gateB: 'Gate B',
  foodCourt: 'Food Court',
  northField: 'North Field',
  firstAid: 'First Aid Tent',
} as const;

export const CLINIC_ID = 'training-clinic';

export const VENUE_POSTS: Post[] = [
  post(POSTS.mainStage, 0.0018, 0),
  post(POSTS.gateA, -0.0026, -0.0040),
  post(POSTS.gateB, -0.0026, 0.0040),
  post(POSTS.foodCourt, -0.0004, 0.0022),
  post(POSTS.northField, 0.0024, -0.0030),
  post(POSTS.firstAid, -0.0010, -0.0016, { isClinic: true, clinicId: CLINIC_ID }),
];

export const ZONES: Zone[] = [
  {
    id: 'training-zone-north',
    name: 'North Lawn',
    color: '#3b82f6',
    points: [],
    coords: [at(0.0032, -0.0052), at(0.0032, 0.0052), at(0, 0.0052), at(0, -0.0052)],
  },
  {
    id: 'training-zone-south',
    name: 'South Lawn',
    color: '#22c55e',
    points: [],
    coords: [at(0, -0.0052), at(0, 0.0052), at(-0.0032, 0.0052), at(-0.0032, -0.0052)],
  },
];

const T0 = () => Date.now() - 45 * 60 * 1000;

const team = (n: number, location: string, members: string[]): Staff => ({
  id: `training-team-${n}`,
  team: `Team ${n}`,
  location,
  status: 'Available',
  members,
  log: [{ timestamp: T0(), message: 'Team created' }],
  statusSince: T0(),
});

export function baseStaff(): Staff[] {
  return [
    team(1, POSTS.mainStage, ['Riley Park [EMT] (Lead)', 'Sam Ortiz [FR]']),
    team(2, POSTS.gateA, ['Jordan Lee [EMT] (Lead)', 'Casey Moore [FR]']),
    team(3, POSTS.gateB, ['Avery Chen [EMT] (Lead)', 'Drew Patel [FA]']),
    team(4, POSTS.foodCourt, ['Morgan Diaz [EMT] (Lead)', 'Quinn Brooks [FR]']),
    team(5, POSTS.northField, ['Taylor Kim [EMT] (Lead)', 'Jamie Fox [FA]']),
  ];
}

export function baseSupervisors(): Supervisor[] {
  return [
    {
      id: 'training-sup-1',
      team: 'Sup 1',
      location: POSTS.firstAid,
      status: 'Available',
      member: 'Alex Rivera [Paramedic]',
      log: [{ timestamp: T0(), message: 'Supervisor created' }],
      statusSince: T0(),
    },
  ];
}

export function baseEquipment(): EventEquipment[] {
  return [
    { id: 'training-eq-gurney', name: 'Gurney 1', status: 'Available', location: POSTS.firstAid, defaultLocation: POSTS.firstAid },
    { id: 'training-eq-wheelchair', name: 'Wheelchair 1', status: 'Available', location: POSTS.mainStage, defaultLocation: POSTS.mainStage },
    { id: 'training-eq-aed', name: 'AED 1', status: 'Available', location: POSTS.gateA, defaultLocation: POSTS.gateA },
  ];
}

export interface BoardOptions {
  /** Calls already on the board. */
  calls?: Call[];
  /** Run the event as a TAK event (scripted feed). */
  tak?: boolean;
  /** Override teams (e.g. more teams for MCI). */
  staff?: Staff[];
}

/** The training festival board, fresh each call. */
export function festivalBoard(moduleId: string, options: BoardOptions = {}): LiteEventDraft {
  const now = new Date();
  const iso = now.toISOString();
  const equipment = baseEquipment();
  return {
    id: `${TRAINING_EVENT_PREFIX}${moduleId}`,
    mode: 'lite',
    name: 'Riverside Music Festival (training)',
    date: iso.split('T')[0],
    postingScheduleEnabled: false,
    scheduleConfig: { from: '16:00', to: '23:59', by: '75' },
    venue: {
      name: 'Riverside Park',
      posts: VENUE_POSTS.map((p) => (typeof p === 'string' ? p : { ...p })),
      equipment: equipment.map(({ id, name, status }) => ({ id, name, status })),
      area: { polygon: AREA },
      zones: ZONES.map((z) => ({ ...z })),
    },
    postingTimes: [],
    staff: options.staff ?? baseStaff(),
    supervisor: baseSupervisors(),
    eventPosts: VENUE_POSTS.map((p) => (typeof p === 'string' ? p : { ...p })),
    postAssignments: {},
    pendingAssignments: {},
    eventEquipment: equipment,
    calls: options.calls ?? [],
    clinics: [{ id: CLINIC_ID, name: POSTS.firstAid }],
    dispatchZones: [],
    ...(options.tak && { mapMode: 'tak' as const }),
    status: 'active',
    createdAt: iso,
    updatedAt: iso,
    surgeLimitPercent: 70,
    pendingTransportSurgeThreshold: 3,
    // Long enough that an unassigned training call doesn't raise a surge alert mid-lesson.
    unassignedCallSurgeSeconds: 900,
  };
}
