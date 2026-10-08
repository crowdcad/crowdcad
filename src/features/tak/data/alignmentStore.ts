import { dbService, isPocketbaseBackend } from '@/lib/services';
import type { TakMapAlignment } from '../types';

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

/** An alignment applies to a layer only while the layer still shows the image it was made for. */
export function alignmentMatches(alignment: TakMapAlignment | undefined, mapUrl: string | undefined): boolean {
  return Boolean(alignment && mapUrl && alignment.mapUrl === mapUrl);
}

/**
 * A layer's current alignment: its own (set in venue setup, D61, and copied
 * into each event's venue snapshot), else one saved on the event before
 * that (the takMapAlignment collection, read only now). Undefined when
 * neither matches the layer's image.
 */
export function alignmentFor(
  layer: { id: string; mapUrl?: string; takAlignment?: TakMapAlignment } | undefined,
  legacy: Record<string, TakMapAlignment> = {},
): TakMapAlignment | undefined {
  if (!layer) return undefined;
  if (alignmentMatches(layer.takAlignment, layer.mapUrl)) return layer.takAlignment;
  const old = legacy[layer.id];
  return alignmentMatches(old, layer.mapUrl) ? old : undefined;
}
