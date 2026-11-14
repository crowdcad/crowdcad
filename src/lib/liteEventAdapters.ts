import { Event, Layer } from '@/app/types';
import { LiteEventDraft, LiteVenueSetup } from '@/lib/liteEventStore';

const LITE_LOCAL_USER_ID = 'lite-local';
const LITE_MAP_LAYER_ID = 'lite-map';

/** A lite venue's map as the one geo layer the shared map components expect, or none without a drawn area. */
export function liteVenueLayers(venue: LiteVenueSetup): Layer[] {
  if (!venue.area || venue.area.polygon.length < 3) return [];
  return [
    {
      id: LITE_MAP_LAYER_ID,
      name: venue.name || 'Map',
      posts: venue.posts || [],
      zones: venue.zones || [],
      area: venue.area,
    },
  ];
}

export function removeUndefinedDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefinedDeep(item)) as unknown as T;
  }

  const cleaned = {} as Record<string, unknown>;
  const record = obj as Record<string, unknown>;

  Object.keys(record).forEach((key) => {
    const val = removeUndefinedDeep(record[key]);
    if (val !== undefined) cleaned[key] = val;
  });

  return cleaned as unknown as T;
}

export function normalizeLiteDraftToEvent(draft: LiteEventDraft): Event {
  const eventPosts = draft.eventPosts?.length ? draft.eventPosts : draft.venue.posts;

  return {
    id: draft.id,
    name: draft.name,
    date: draft.date,
    venue: {
      id: `lite-venue-${draft.id}`,
      name: draft.venue.name || 'Lite Venue',
      equipment: draft.venue.equipment || [],
      posts: draft.venue.posts || [],
      layers: liteVenueLayers(draft.venue),
      userId: LITE_LOCAL_USER_ID,
      mapUrl: undefined,
    },
    userId: LITE_LOCAL_USER_ID,
    postingTimes: draft.postingTimes || [],
    staff: draft.staff || [],
    supervisor: draft.supervisor || [],
    calls: draft.calls || [],
    status: draft.status,
    createdAt: draft.createdAt,
    eventPosts: eventPosts || [],
    eventEquipment: draft.eventEquipment || [],
    postAssignments: draft.postAssignments || {},
    pendingAssignments: draft.pendingAssignments || {},
    surgeLimitPercent: draft.surgeLimitPercent,
    pendingTransportSurgeThreshold: draft.pendingTransportSurgeThreshold,
    unassignedCallSurgeSeconds: draft.unassignedCallSurgeSeconds,
    clinics: draft.clinics || [],
    dispatchZones: draft.dispatchZones || [],
    mci: draft.mci,
  };
}

export function toLiteDraftFromEvent(nextEvent: Event, previousDraft: LiteEventDraft): LiteEventDraft {
  return {
    ...previousDraft,
    id: nextEvent.id || previousDraft.id,
    mode: 'lite',
    name: nextEvent.name ?? previousDraft.name,
    date: nextEvent.date ?? previousDraft.date,
    venue: {
      name: nextEvent.venue?.name ?? previousDraft.venue.name,
      posts: nextEvent.eventPosts ?? nextEvent.venue?.posts ?? previousDraft.venue.posts,
      equipment: nextEvent.venue?.equipment ?? previousDraft.venue.equipment,
      area: previousDraft.venue.area,
      zones: previousDraft.venue.zones,
    },
    postingTimes: nextEvent.postingTimes || [],
    staff: nextEvent.staff || [],
    supervisor: nextEvent.supervisor || [],
    eventPosts: nextEvent.eventPosts || [],
    eventEquipment: nextEvent.eventEquipment || [],
    calls: nextEvent.calls || [],
    status: nextEvent.status ?? previousDraft.status ?? 'active',
    postAssignments: nextEvent.postAssignments || {},
    pendingAssignments: nextEvent.pendingAssignments || {},
    surgeLimitPercent: nextEvent.surgeLimitPercent ?? previousDraft.surgeLimitPercent,
    pendingTransportSurgeThreshold: nextEvent.pendingTransportSurgeThreshold ?? previousDraft.pendingTransportSurgeThreshold,
    unassignedCallSurgeSeconds: nextEvent.unassignedCallSurgeSeconds ?? previousDraft.unassignedCallSurgeSeconds,
    clinics: nextEvent.clinics ?? previousDraft.clinics,
    dispatchZones: nextEvent.dispatchZones ?? previousDraft.dispatchZones,
    mci: nextEvent.mci ?? previousDraft.mci,
    createdAt:
      typeof nextEvent.createdAt === 'string' ? nextEvent.createdAt : previousDraft.createdAt,
    updatedAt: new Date().toISOString(),
  };
}
