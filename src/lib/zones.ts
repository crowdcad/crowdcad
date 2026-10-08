import type { Call, DispatchZone, Layer, Post, Zone } from '@/app/types';
import { isGeoLayer } from '@/lib/geo/layers';
import { postLatLng, zoneLatLngs } from '@/lib/geo/positions';

/** Resolves an event's dispatch zones. Unlike clinics, there's no default fallback zone — "All Calls" already covers every call regardless of dispatch zones. */
export function getEventDispatchZones(zones: DispatchZone[] | undefined): DispatchZone[] {
  return zones ?? [];
}

export function isZoneDispatchZone(zone: Zone): boolean {
  return zone.isDispatchZone === true;
}

/**
 * Minimal shape accepted by getVenueZones — matches both Venue and
 * LiteVenueSetup. `posts` is declared (but unused here) purely so this type
 * shares a property name with LiteVenueSetup (which has no `layers` at all,
 * lite mode having no map to draw zones on) — without it, TS's weak-type
 * check rejects LiteVenueSetup outright since every other property here is
 * optional and none would otherwise overlap.
 */
type ZonesSource = { posts?: Post[]; layers?: { zones?: Zone[] }[] };

/** Flattens every zone across a venue's layers. Zones only ever live on layers (no flat venue.zones cache, unlike posts — there's no pre-layers legacy shape to fall back to). A `Venue` (which has `layers?: Layer[]`) satisfies this structurally, so it's covered without a separate union member. */
export function getVenueZones(venue: ZonesSource | undefined | null): Zone[] {
  if (!venue) return [];
  return (venue.layers || []).flatMap((layer) => layer.zones || []);
}

type CoordinatedPost = { name: string; x: number; y: number };

function isCoordinatedPost(post: Post): post is CoordinatedPost {
  return typeof post === 'object' && post !== null && typeof post.x === 'number' && typeof post.y === 'number';
}

/** Standard ray-casting point-in-polygon test. Works directly on percent-of-image coordinates since the test is scale-invariant. */
export function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Locates a post by name among `layers` and returns every zone (on that
 * post's own layer) whose polygon contains it. A post with no position
 * (free-text location, no map) or no name match returns no zones. Checks
 * every layer in case more than one has a post with this name. On a geo
 * layer (P8, D64) the test runs in coordinates, so posts and zones outside
 * the venue image count too.
 */
export function findZonesForPost(postName: string, layers: Layer[]): Zone[] {
  const matches: Zone[] = [];
  for (const layer of layers) {
    const post = (layer.posts || []).find((p) => typeof p !== 'string' && p.name === postName);
    if (!post) continue;
    const at = isGeoLayer(layer) ? postLatLng(post, layer) : null;
    for (const zone of layer.zones || []) {
      const coords = at ? zoneLatLngs(zone, layer) : null;
      if (at && coords) {
        if (pointInPolygon({ x: at.lng, y: at.lat }, coords.map((c) => ({ x: c.lng, y: c.lat })))) matches.push(zone);
      } else if (isCoordinatedPost(post) && zone.points.length >= 3 && pointInPolygon(post, zone.points)) {
        matches.push(zone);
      }
    }
  }
  return matches;
}

/** Dispatch-zone ids a call's location falls within, deduplicated. A call can belong to more than one zone if their polygons overlap. */
export function getCallZoneIds(call: Call, layers: Layer[]): string[] {
  if (!call.location) return [];
  const zoneIds = findZonesForPost(call.location, layers)
    .filter(isZoneDispatchZone)
    .map((zone) => zone.id);
  return Array.from(new Set(zoneIds));
}

/**
 * Additively merges dispatch-zone-flagged venue zones into an event's
 * existing dispatch zones list, matched by `Zone.id`. Never removes an
 * entry whose backing zone disappeared, so calls already routed to a zone
 * tab don't silently lose that tab mid-event.
 */
export function syncDispatchZonesFromVenue(
  venue: ZonesSource | undefined | null,
  existingDispatchZones: DispatchZone[] | undefined
): DispatchZone[] {
  const dispatchZones = getVenueZones(venue).filter(isZoneDispatchZone);

  const byId = new Map((existingDispatchZones || []).map((z) => [z.id, z]));

  for (const zone of dispatchZones) {
    const existing = byId.get(zone.id);
    if (!existing) {
      byId.set(zone.id, { id: zone.id, name: zone.name });
    } else if (existing.name !== zone.name) {
      byId.set(zone.id, { ...existing, name: zone.name });
    }
  }

  return Array.from(byId.values());
}

/**
 * Layers to test a call's location against for zone membership, mirroring
 * the derivation the dispatch Map tab uses: the venue's own multi-layer
 * array when present, falling back to a single synthetic layer built from
 * the venue's legacy single mapUrl/eventPosts for venues saved before
 * layers existed. Shared here so the dispatch view and the post-event
 * summary page resolve a call's zone(s) identically.
 */
export function getEventVenueLayers(
  event: { venue?: { layers?: Layer[]; name?: string; mapUrl?: string } | null; eventPosts?: Post[] } | null | undefined
): Layer[] {
  if (!event?.venue) return [];
  if (event.venue.layers && event.venue.layers.length) return event.venue.layers;
  return [
    {
      id: 'legacy-layer',
      name: event.venue.name || 'Main Floor',
      posts: event.eventPosts || [],
      mapUrl: event.venue.mapUrl,
    },
  ];
}

/** Per-zone call totals for a finished event's summary — every call that fell inside a dispatch zone at any point (by location), regardless of the call's current status. */
export interface ZoneCallSummary {
  zoneId: string;
  zoneName: string;
  totalCalls: number;
  deliveredToClinic: number;
  transports: number;
}

/**
 * Builds a `ZoneCallSummary` per dispatch zone for the post-event summary
 * page, reusing the exact same call-to-zone resolution the dispatch view's
 * tabs use (`getCallZoneIds` against `getEventVenueLayers`), so a summary
 * always matches what dispatchers saw live.
 */
export function getZoneCallSummaries(event: {
  venue?: { layers?: Layer[]; name?: string; mapUrl?: string } | null;
  eventPosts?: Post[];
  calls?: Call[];
  dispatchZones?: DispatchZone[];
} | null | undefined): ZoneCallSummary[] {
  const dispatchZones = getEventDispatchZones(event?.dispatchZones);
  if (dispatchZones.length === 0) return [];

  const layers = getEventVenueLayers(event);
  const calls = event?.calls || [];

  return dispatchZones.map((zone) => {
    const zoneCalls = calls.filter((call) => getCallZoneIds(call, layers).includes(zone.id));
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      totalCalls: zoneCalls.length,
      deliveredToClinic: zoneCalls.filter((c) => c.status === 'Delivered' || c.clinic === true).length,
      transports: zoneCalls.filter((c) =>
        c.outcome === 'Transported' ||
        c.outcome === 'Rolled from Clinic' ||
        c.status === 'Rolled from Scene' ||
        c.detachedTeams?.some((dt) => dt.reason === 'Rolled from Scene')
      ).length,
    };
  });
}

/**
 * True if `name` matches another dispatch-zone-flagged zone in `allZones`
 * (case-insensitive), excluding the zone currently being edited. Two
 * dispatch zones sharing a name would render two identically-labeled
 * dispatch tabs; plain (non-dispatch) zones may still share names.
 */
export function hasDuplicateZoneName(
  name: string,
  allZones: { zone: Zone; layerIdx: number; zoneIdx: number }[],
  exclude?: { layerIdx: number; zoneIdx: number }
): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return allZones.some(({ zone, layerIdx, zoneIdx }) => {
    if (exclude && layerIdx === exclude.layerIdx && zoneIdx === exclude.zoneIdx) return false;
    if (!isZoneDispatchZone(zone)) return false;
    return zone.name.trim().toLowerCase() === trimmed;
  });
}
