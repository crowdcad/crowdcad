/**
 * Real-world map types shared by core and the TAK module (P8, D64).
 * A map image is tied to real coordinates by an alignment: an affine
 * transform from local meters to image percent, fitted from control points.
 */

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

/** A map image's real-world alignment. */
export interface MapAlignment {
  /** The image this alignment was made for. A layer whose mapUrl differs needs aligning again. */
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

/** A drawn area of interest for a layer with no image: the live map centers on it. */
export interface MapArea {
  polygon: { lat: number; lng: number }[];
}
