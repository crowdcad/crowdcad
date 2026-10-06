// TAK integration types (in development, optional). Shapes follow
// docs/tak-integration/data-contract.md. Core code outside src/features/tak
// may import these types only through the module entry (index.ts).

export type HistoryMode = 'off' | 'summary' | 'detailed';

export interface LatLon {
  lat: number;
  lon: number;
}

/** A control point: a spot on the map image (percent of width/height) and its real position. */
export interface ControlPoint {
  x: number;
  y: number;
  lat: number;
  lon: number;
  label?: string;
}

/**
 * Affine transform from local meters (east, north of `origin`) to image
 * percent: x% = a*E + b*N + c, y% = d*E + e*N + f.
 */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Map alignment for one event map layer (takMapAlignment / tak_map_alignment). */
export interface TakMapAlignment {
  /** The image this alignment was made for. A layer whose mapUrl differs needs re-aligning. */
  mapUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  controlPoints: ControlPoint[];
  origin: LatLon;
  transform: AffineTransform;
  /** Estimated position error in meters, or null with only 3 points (no redundancy to estimate it). */
  residualM: number | null;
  ownerUid: string;
  updatedAt: number;
}
