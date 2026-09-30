import type { GeoBounds, Post, Zone } from '@/app/types';
import { getNextZoneColor } from '@/lib/zoneColors';
import { randomId } from '@/lib/utils';

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function isPointWithinRect(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function pixelToPercent(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): { x: number; y: number } {
  const xPercent = ((clientX - rect.left) / rect.width) * 100;
  const yPercent = ((clientY - rect.top) / rect.height) * 100;

  return {
    x: clampPercent(xPercent),
    y: clampPercent(yPercent),
  };
}

export interface GeoJsonPointFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties?: {
    name?: string;
    isClinic?: boolean;
    [key: string]: unknown;
  } | null;
}

/**
 * A polygon zone feature. `Polygon.coordinates` is an array of linear rings
 * ([lng, lat] pairs, first = outer boundary, any further rings = holes —
 * holes aren't supported, only the outer ring is imported). `MultiPolygon`
 * is accepted for compatibility with GIS exports that produce one even for
 * a single-part shape; only its first polygon's outer ring is imported.
 */
export interface GeoJsonPolygonFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: [number, number][][] }
    | { type: 'MultiPolygon'; coordinates: [number, number][][][] };
  properties?: {
    name?: string;
    isDispatchZone?: boolean;
    color?: string;
    [key: string]: unknown;
  } | null;
}

export type GeoJsonFeature = GeoJsonPointFeature | GeoJsonPolygonFeature;

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  bbox?: [number, number, number, number]; // [west, south, east, north]
  features: GeoJsonFeature[];
}

function isPointFeature(feature: unknown): feature is GeoJsonPointFeature {
  if (typeof feature !== 'object' || feature === null) return false;
  const f = feature as Record<string, unknown>;
  if (f.type !== 'Feature') return false;
  const geometry = f.geometry as Record<string, unknown> | undefined;
  if (!geometry || geometry.type !== 'Point') return false;
  const coords = geometry.coordinates;
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  );
}

function isLngLatPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function isPolygonFeature(feature: unknown): feature is GeoJsonPolygonFeature {
  if (typeof feature !== 'object' || feature === null) return false;
  const f = feature as Record<string, unknown>;
  if (f.type !== 'Feature') return false;
  const geometry = f.geometry as Record<string, unknown> | undefined;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates;
    return Array.isArray(rings) && rings.length > 0 && Array.isArray(rings[0]) && rings[0].length >= 3 && rings[0].every(isLngLatPair);
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates;
    return (
      Array.isArray(polygons) &&
      polygons.length > 0 &&
      Array.isArray(polygons[0]) &&
      Array.isArray(polygons[0][0]) &&
      polygons[0][0].length >= 3 &&
      polygons[0][0].every(isLngLatPair)
    );
  }
  return false;
}

/** Every [lng, lat] pair (from Point coordinates or Polygon/MultiPolygon rings) in a FeatureCollection — used to derive a fallback bounding box. */
function collectionLngLatPairs(collection: GeoJsonFeatureCollection): [number, number][] {
  const pairs: [number, number][] = [];
  for (const feature of collection.features) {
    if (isPointFeature(feature)) {
      pairs.push(feature.geometry.coordinates);
    } else if (isPolygonFeature(feature)) {
      const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
      pairs.push(...ring);
    }
  }
  return pairs;
}

export function isGeoJsonFeatureCollection(
  value: unknown
): value is GeoJsonFeatureCollection {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.type === 'FeatureCollection' && Array.isArray(v.features);
}

/**
 * Combines several FeatureCollections into one for the purposes of deriving
 * a single shared geoBounds — used when a points file and a polygons file
 * are imported together (ArcGIS typically exports one geometry type per
 * layer/file), so both are georeferenced against the same extent instead of
 * each computing its own, which could misalign them on the shared image.
 */
export function mergeFeatureCollections(
  collections: (GeoJsonFeatureCollection | null | undefined)[]
): GeoJsonFeatureCollection {
  const present = collections.filter((c): c is GeoJsonFeatureCollection => !!c);
  return {
    type: 'FeatureCollection',
    bbox: present.find((c) => c.bbox)?.bbox,
    features: present.flatMap((c) => c.features),
  };
}

/**
 * Derives a geographic bounding box for a FeatureCollection: prefers the
 * standard top-level `bbox` member, falling back to the min/max extent of
 * the collection's own points/polygon vertices when `bbox` is absent.
 */
export function deriveGeoBounds(
  collection: GeoJsonFeatureCollection
): GeoBounds | null {
  if (collection.bbox && collection.bbox.length === 4) {
    const [west, south, east, north] = collection.bbox;
    return { north, south, east, west };
  }

  const pairs = collectionLngLatPairs(collection);
  if (pairs.length === 0) return null;

  const lngs = pairs.map(([lng]) => lng);
  const lats = pairs.map(([, lat]) => lat);

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

export function latLngToPercent(
  lat: number,
  lng: number,
  bounds: GeoBounds
): { x: number; y: number } {
  const lngSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;

  if (lngSpan === 0 || latSpan === 0) {
    throw new Error('Invalid geoBounds: north/south or east/west span is zero');
  }

  const xPercent = ((lng - bounds.west) / lngSpan) * 100;
  const yPercent = ((bounds.north - lat) / latSpan) * 100;

  return {
    x: clampPercent(xPercent),
    y: clampPercent(yPercent),
  };
}

export interface GeoJsonImportResult {
  posts: Post[];
  geoBounds: GeoBounds;
  skipped: number;
}

/**
 * Converts a GeoJSON FeatureCollection of Point features into Posts placed
 * on the existing percent-of-image marker system, using `bounds` (or the
 * collection's own bbox/extent) to georeference lat/lng into x/y percent.
 * Non-Point features, or Point features missing a usable name, are skipped
 * and counted rather than throwing, since a single bad feature shouldn't
 * block importing the rest.
 */
export function geoJsonToPosts(
  collection: GeoJsonFeatureCollection,
  bounds?: GeoBounds
): GeoJsonImportResult {
  const geoBounds = bounds ?? deriveGeoBounds(collection);
  if (!geoBounds) {
    throw new Error(
      'Could not determine geographic bounds: GeoJSON has no bbox and no usable point features'
    );
  }

  const posts: Post[] = [];
  let skipped = 0;

  for (const feature of collection.features) {
    if (!isPointFeature(feature)) {
      skipped += 1;
      continue;
    }

    const name = feature.properties?.name;
    if (typeof name !== 'string' || name.trim() === '') {
      skipped += 1;
      continue;
    }

    const [lng, lat] = feature.geometry.coordinates;
    const { x, y } = latLngToPercent(lat, lng, geoBounds);

    posts.push({
      name,
      x,
      y,
      isClinic: Boolean(feature.properties?.isClinic),
      lat,
      lng,
    });
  }

  return { posts, geoBounds, skipped };
}

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface GeoJsonZoneImportResult {
  zones: Zone[];
  geoBounds: GeoBounds;
  skipped: number;
}

/**
 * Converts a GeoJSON FeatureCollection's Polygon/MultiPolygon features into
 * Zones on the same percent-of-image system geoJsonToPosts uses for points,
 * reprojecting each ring via the same `bounds`/bbox-or-extent resolution.
 * Non-polygon features, or polygon features missing a usable name, are
 * skipped and counted rather than throwing — same convention as
 * geoJsonToPosts. Only a polygon's outer ring is imported (holes, and any
 * part beyond a MultiPolygon's first, are dropped); the ring's closing
 * vertex (GeoJSON repeats the first point last) is stripped since the
 * app's own polygon rendering already closes the loop implicitly.
 */
export function geoJsonToZones(
  collection: GeoJsonFeatureCollection,
  bounds?: GeoBounds
): GeoJsonZoneImportResult {
  const geoBounds = bounds ?? deriveGeoBounds(collection);
  if (!geoBounds) {
    throw new Error(
      'Could not determine geographic bounds: GeoJSON has no bbox and no usable point/polygon features'
    );
  }

  const zones: Zone[] = [];
  let skipped = 0;

  for (const feature of collection.features) {
    if (!isPolygonFeature(feature)) {
      skipped += 1;
      continue;
    }

    const name = feature.properties?.name;
    if (typeof name !== 'string' || name.trim() === '') {
      skipped += 1;
      continue;
    }

    const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
    const openRing =
      ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    const points = openRing.map(([lng, lat]) => latLngToPercent(lat, lng, geoBounds));

    const color = feature.properties?.color;
    zones.push({
      id: randomId(),
      name,
      color: typeof color === 'string' && HEX_COLOR_PATTERN.test(color) ? color : getNextZoneColor(zones),
      points,
      isDispatchZone: Boolean(feature.properties?.isDispatchZone),
    });
  }

  return { zones, geoBounds, skipped };
}
