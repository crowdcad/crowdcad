import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { TakMapAlignment } from '../types';
import { alignmentMatches, layerAlignment } from '@/lib/geo/layers';

/**
 * Map alignments, one per event map layer. Firebase stores them at
 * events/{eventId}/takMapAlignment/{layerId}; PocketBase in the flat
 * tak_map_alignment collection, keyed by (event, layerId). Only the event
 * owner can write them (see the TAK rules on each backend).
 */

const PB_COLLECTION = 'tak_map_alignment';
const fsCollection = (eventId: string) => `events/${eventId}/takMapAlignment`;

type PbAlignmentRecord = TakMapAlignment & { event: string; layerId: string };

function fromRecord(r: Partial<TakMapAlignment>): TakMapAlignment {
  return {
    mapUrl: r.mapUrl ?? '',
    naturalWidth: r.naturalWidth ?? 0,
    naturalHeight: r.naturalHeight ?? 0,
    controlPoints: r.controlPoints ?? [],
    origin: r.origin ?? { lat: 0, lon: 0 },
    transform: r.transform ?? { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 },
    residualM: typeof r.residualM === 'number' ? r.residualM : null,
    ownerUid: r.ownerUid ?? '',
    updatedAt: r.updatedAt ?? 0,
  };
}

async function findPb(eventId: string, layerId: string) {
  const found = await dbService.queryCollection<PbAlignmentRecord>(PB_COLLECTION, [
    { field: 'event', op: '==', value: eventId },
    { field: 'layerId', op: '==', value: layerId },
  ]);
  return found[0];
}

export async function loadAlignments(eventId: string): Promise<Record<string, TakMapAlignment>> {
  if (isPocketbaseBackend) {
    const snaps = await dbService.queryCollection<PbAlignmentRecord>(PB_COLLECTION, [
      { field: 'event', op: '==', value: eventId },
    ]);
    return Object.fromEntries(snaps.flatMap((s) => (s.data ? [[s.data.layerId, fromRecord(s.data)]] : [])));
  }
  const snaps = await dbService.getCollection<TakMapAlignment>(fsCollection(eventId));
  return Object.fromEntries(snaps.flatMap((s) => (s.data ? [[s.id, fromRecord(s.data)]] : [])));
}

export async function saveAlignment(eventId: string, layerId: string, alignment: TakMapAlignment): Promise<void> {
  if (isPocketbaseBackend) {
    const existing = await findPb(eventId, layerId);
    if (existing) {
      // event and layerId are fixed once created; the rules forbid changing event.
      await dbService.updateDocument(PB_COLLECTION, existing.id, { ...alignment });
    } else {
      await dbService.addDocument<PbAlignmentRecord>(PB_COLLECTION, { ...alignment, event: eventId, layerId });
    }
    return;
  }
  await dbService.setDocument(fsCollection(eventId), layerId, alignment);
}

export async function deleteAlignment(eventId: string, layerId: string): Promise<void> {
  if (isPocketbaseBackend) {
    const existing = await findPb(eventId, layerId);
    if (existing) await dbService.deleteDocument(PB_COLLECTION, existing.id);
    return;
  }
  await dbService.deleteDocument(fsCollection(eventId), layerId);
}

export { alignmentMatches };

/**
 * A layer's current alignment, from (in order): the venue's own layer as it
 * is now (set in venue setup, D61), the copy in the event's venue snapshot,
 * or an alignment saved on the event before venue setup did it (the
 * takMapAlignment collection, read only now). Each counts only while it was
 * made for the image the layer shows. Undefined when none matches.
 */
export function alignmentFor(
  layer: { id: string; mapUrl?: string; alignment?: TakMapAlignment; takAlignment?: TakMapAlignment } | undefined,
  legacy: Record<string, TakMapAlignment> = {},
  venue: Record<string, TakMapAlignment> = {},
): TakMapAlignment | undefined {
  if (!layer) return undefined;
  if (alignmentMatches(venue[layer.id], layer.mapUrl)) return venue[layer.id];
  return layerAlignment(layer) ?? (alignmentMatches(legacy[layer.id], layer.mapUrl) ? legacy[layer.id] : undefined);
}

type VenueRecord = { id?: string; layers?: { id: string; mapUrl?: string; alignment?: TakMapAlignment; takAlignment?: TakMapAlignment }[] };

async function eventVenue(eventId: string): Promise<{ event: { venue?: VenueRecord }; venueId: string | null }> {
  const snap = await dbService.getDocument<{ venue?: VenueRecord }>('events', eventId);
  const event = snap.data ?? {};
  return { event, venueId: event.venue?.id ?? null };
}

/**
 * The alignments on the event's venue as it is now, by layer id. Lets an
 * event use a venue aligned after the event was created. Empty when the
 * venue is gone or the reader can't read it (e.g. a dispatcher it isn't
 * shared with): they use the event's copy instead.
 */
export async function loadVenueAlignments(eventId: string): Promise<Record<string, TakMapAlignment>> {
  try {
    const { venueId } = await eventVenue(eventId);
    if (!venueId) return {};
    const venue = await dbService.getDocument<VenueRecord>('venues', venueId);
    const out: Record<string, TakMapAlignment> = {};
    for (const l of venue.data?.layers ?? []) {
      const a = l.alignment ?? l.takAlignment;
      if (a) out[l.id] = fromRecord(a);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Copies the venue's current alignments into the event's venue snapshot
 * (event owner), so everyone who can read the event gets them. Returns how
 * many maps were updated.
 */
export async function copyVenueAlignmentsToEvent(eventId: string): Promise<number> {
  const { event, venueId } = await eventVenue(eventId);
  if (!venueId || !event.venue?.layers) return 0;
  const fromVenue = await loadVenueAlignments(eventId);
  let changed = 0;
  const layers = event.venue.layers.map((l) => {
    const a = fromVenue[l.id];
    if (!a || !alignmentMatches(a, l.mapUrl) || (l.alignment ?? l.takAlignment)?.updatedAt === a.updatedAt) return l;
    changed++;
    return { ...l, alignment: a };
  });
  if (changed) await dbService.updateDocument('events', eventId, { venue: { ...event.venue, layers } });
  return changed;
}
