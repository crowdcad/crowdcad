import type { Call, Event, EventEquipment, Post, Staff, Supervisor, Zone } from '@/app/types';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from '@/lib/liteEventAdapters';
import type { LiteEventDraft } from '@/lib/liteEventStore';
import { PRACTICE_MAP } from './practiceMap';

/**
 * The boards training modules start from. The places come from the training
 * map (src/training/practiceMap.ts); the event, the people and the patients
 * are made up. Trainees only ever see and type
 * this script's text while a module is locked (src/training/gate.ts).
 */

export const TRAINING_EVENT_PREFIX = 'training-';

/**
 * The place names the module scripts use. Every one must be in the training map
 * (src/training/maps/practice-map.json, read by src/training/practiceMap.ts): rename a place
 * there and here together. src/training/modules.test.ts checks they match.
 */
export const POSTS = {
  doeSteps: 'Doe Main Steps',
  doeWest: 'Doe West Walkway',
  bancroftSteps: 'Bancroft Main Steps',
  lowerSproul: 'Lower Sproul',
  upperSproul: 'Upper Sproul',
  satherGate: 'Sather Gate',
  socialSciences: 'Social Sciences Side Entrance',
  bancroftCross: 'Bancroft Way Cross',
  /** The main clinic: walk-ups, deliveries and MCI treatment go here. */
  clinic: 'Dwinelle Tent',
} as const;

/** The main clinic's id (its tab is `clinic-tab-training-clinic`). */
export const CLINIC_ID = 'training-clinic';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every clinic on the map, the main one first (the MCI move dialog defaults to the first). */
export const CLINICS: { id: string; name: string }[] = [...PRACTICE_MAP.clinics]
  .sort((a, b) => Number(b.name === POSTS.clinic) - Number(a.name === POSTS.clinic))
  .map((c) => ({ id: c.name === POSTS.clinic ? CLINIC_ID : `training-clinic-${slug(c.name)}`, name: c.name }));

const post = (name: string, lat: number, lng: number, extra: Partial<Exclude<Post, string>> = {}): Post => ({ name, x: null, y: null, lat, lng, ...extra });

export const VENUE_POSTS: Post[] = [
  ...PRACTICE_MAP.posts.map((p) => post(p.name, p.lat, p.lng)),
  ...PRACTICE_MAP.clinics.map((c) => post(c.name, c.lat, c.lng, { isClinic: true, clinicId: CLINICS.find((k) => k.name === c.name)!.id })),
];

const ZONE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

export const ZONES: Zone[] = PRACTICE_MAP.zones.map((z, i) => ({
  id: `training-zone-${slug(z.name)}`,
  name: z.name,
  color: z.color ?? ZONE_COLORS[i % ZONE_COLORS.length],
  points: [],
  coords: z.coords,
}));

const T0 = () => Date.now() - 45 * 60 * 1000;

/** A team's name: also the TAK call sign its practice device uses, and the key of its path on the map. */
export const teamName = (n: number) => `MRC${n}`;

const team = (n: number, location: string, members: string[]): Staff => ({
  id: `training-team-${n}`,
  team: teamName(n),
  location,
  status: 'Available',
  members,
  log: [{ timestamp: T0(), message: 'Team created' }],
  statusSince: T0(),
});

export function baseStaff(): Staff[] {
  return [
    team(1, POSTS.lowerSproul, ['Riley Park [EMT] (Lead)', 'Sam Ortiz [FR]']),
    team(2, POSTS.doeWest, ['Jordan Lee [EMT] (Lead)', 'Casey Moore [FR]']),
    team(3, POSTS.satherGate, ['Avery Chen [EMT] (Lead)', 'Drew Patel [FA]']),
    team(4, POSTS.socialSciences, ['Morgan Diaz [EMT] (Lead)', 'Quinn Brooks [FR]']),
    team(5, POSTS.bancroftCross, ['Taylor Kim [EMT] (Lead)', 'Jamie Fox [FA]']),
  ];
}

export function baseSupervisors(): Supervisor[] {
  return [
    {
      id: 'training-sup-1',
      team: 'Sup 1',
      location: POSTS.clinic,
      status: 'Available',
      member: 'Alex Rivera [Paramedic]',
      log: [{ timestamp: T0(), message: 'Supervisor created' }],
      statusSince: T0(),
    },
  ];
}

export function baseEquipment(): EventEquipment[] {
  return [
    { id: 'training-eq-gurney', name: 'Gurney 1', status: 'Available', location: POSTS.clinic, defaultLocation: POSTS.clinic },
    { id: 'training-eq-wheelchair', name: 'Wheelchair 1', status: 'Available', location: POSTS.upperSproul, defaultLocation: POSTS.upperSproul },
    { id: 'training-eq-aed', name: 'AED 1', status: 'Available', location: POSTS.doeSteps, defaultLocation: POSTS.doeSteps },
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

/** The training event's board, fresh each call. */
export function trainingBoard(moduleId: string, options: BoardOptions = {}): LiteEventDraft {
  const now = new Date();
  const iso = now.toISOString();
  const equipment = baseEquipment();
  return {
    id: `${TRAINING_EVENT_PREFIX}${moduleId}`,
    mode: 'lite',
    name: 'Campus Day (training)',
    date: iso.split('T')[0],
    postingScheduleEnabled: false,
    scheduleConfig: { from: '16:00', to: '23:59', by: '75' },
    venue: {
      name: 'Campus',
      posts: VENUE_POSTS.map((p) => (typeof p === 'string' ? p : { ...p })),
      equipment: equipment.map(({ id, name, status }) => ({ id, name, status })),
      area: { polygon: PRACTICE_MAP.area },
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
    clinics: CLINICS.map((c) => ({ ...c })),
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

/** The festival board with some of the shift already played out (calls, statuses), built with src/training/actions.ts. */
export function trainingBoardAfter(moduleId: string, play: (event: Event) => Event, options: BoardOptions = {}): LiteEventDraft {
  const draft = trainingBoard(moduleId, options);
  return toLiteDraftFromEvent(play(normalizeLiteDraftToEvent(draft)), draft);
}
