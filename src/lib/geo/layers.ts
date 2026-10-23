import { fitAffine } from './affine';
import type { MapAlignment, MapArea } from './types';

/**
 * Real-world map layers (P8, D64). A layer is a geo layer when its image has
 * a current alignment, or when it has a drawn area and no image. Everything
 * else is an image layer and behaves as before.
 */

type LayerLike = {
  mapUrl?: string;
  alignment?: MapAlignment;
  /** Venues aligned during TAK development used this name; still read. */
  takAlignment?: MapAlignment;
  area?: MapArea;
  geoBounds?: { north: number; south: number; east: number; west: number };
};

/** An alignment applies only while the layer still shows the image it was made for. */
export function alignmentMatches(alignment: MapAlignment | undefined, mapUrl: string | undefined): boolean {
  return Boolean(alignment && mapUrl && alignment.mapUrl === mapUrl);
}

/** The layer's current alignment, if it has one for its image. */
export function layerAlignment(layer: LayerLike | undefined): MapAlignment | undefined {
  if (!layer) return undefined;
  for (const a of [layer.alignment, layer.takAlignment]) if (alignmentMatches(a, layer.mapUrl)) return a;
  return undefined;
}

/** A drawn area, for a layer with no image. */
export function layerArea(layer: LayerLike | undefined): MapArea | undefined {
  return layer && !layer.mapUrl && layer.area && layer.area.polygon.length >= 3 ? layer.area : undefined;
}

export function isGeoLayer(layer: LayerLike | undefined): boolean {
  return !!layerAlignment(layer) || !!layerArea(layer);
}

/** [west, south, east, north] of an area. */
export function areaBounds(area: MapArea): [number, number, number, number] {
  const lats = area.polygon.map((p) => p.lat);
  const lngs = area.polygon.map((p) => p.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/**
 * An alignment for a GIS-imported image, whose bounds say where its edges
 * are (north up, no rotation): its four corners are exact control points.
 */
export function alignmentFromBounds(
  bounds: { north: number; south: number; east: number; west: number },
  image: { mapUrl: string; naturalWidth: number; naturalHeight: number },
  ownerUid: string,
): MapAlignment | null {
  const controlPoints = [
    { x: 0, y: 0, lat: bounds.north, lon: bounds.west, label: 'North-west corner' },
    { x: 100, y: 0, lat: bounds.north, lon: bounds.east, label: 'North-east corner' },
    { x: 100, y: 100, lat: bounds.south, lon: bounds.east, label: 'South-east corner' },
    { x: 0, y: 100, lat: bounds.south, lon: bounds.west, label: 'South-west corner' },
  ];
  const fit = fitAffine(controlPoints, image.naturalWidth, image.naturalHeight);
  if ('error' in fit) return null;
  return {
    mapUrl: image.mapUrl,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    controlPoints,
    origin: fit.origin,
    transform: fit.transform,
    residualM: fit.residualM,
    ownerUid,
    updatedAt: Date.now(),
  };
}
