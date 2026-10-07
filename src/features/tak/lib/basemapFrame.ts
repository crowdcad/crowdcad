import { M_PER_DEG, percentToLatLon } from './affine';
import type { AffineTransform, LatLon } from '../types';

/**
 * Geometry for drawing a basemap in an aligned map image's frame (D56).
 *
 * The dispatch map shows the image upright, so the basemap has to be rotated,
 * scaled (and, for a slightly skewed alignment, sheared) to match. The map is
 * rendered by MapLibre with a bearing that takes out the rotation, so labels
 * stay upright, and a CSS matrix applies what is left (scale near 1, any
 * shear). Within a venue, Web Mercator is linear to well under a pixel, so
 * the result matches latLonToPercent.
 */

interface Alignment {
  origin: LatLon;
  transform: AffineTransform;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BasemapFrame {
  /** Position at the container's center. */
  center: LatLon;
  zoom: number;
  /** MapLibre bearing, in degrees. */
  bearing: number;
  /** The map element's layout box, in container pixels (already multiplied by `oversample`). */
  box: Box;
  /** CSS transform for the map element, about its center. */
  transform: string;
  /** Rendering scale: the map is drawn this many times larger, then scaled down, so it stays sharp when zoomed in. */
  oversample: number;
}

/** MapLibre's world size in pixels at zoom 0 (512-pixel tiles). */
const WORLD_PX = 512;

/** Pixels per local meter at a zoom and latitude, for the meters used by the alignment (see affine.ts). */
export function pxPerMeter(zoom: number, lat: number): number {
  return (WORLD_PX * 2 ** zoom) / (360 * M_PER_DEG * Math.cos((lat * Math.PI) / 180));
}

/**
 * The frame for a container of `container` size showing the image at `rect`
 * (both in unscaled container pixels), or null if the alignment is mirrored
 * or degenerate. `scale` is the map's current zoom; `maxCanvasPx` caps the
 * rendered size.
 */
export function basemapFrame(
  alignment: Alignment,
  rect: Box,
  container: { width: number; height: number },
  scale = 1,
  maxCanvasPx = 4096,
): BasemapFrame | null {
  if (rect.width <= 0 || rect.height <= 0 || container.width <= 0 || container.height <= 0) return null;
  const t = alignment.transform;
  // Local meters (east, north) to container pixels.
  const L = [
    [(t.a * rect.width) / 100, (t.b * rect.width) / 100],
    [(t.d * rect.height) / 100, (t.e * rect.height) / 100],
  ] as const;
  const detL = L[0][0] * L[1][1] - L[0][1] * L[1][0];
  // Image y grows downward while north grows upward, so an unmirrored alignment has detL < 0.
  if (!(detL < 0) || !Number.isFinite(detL)) return null;

  const cx = container.width / 2;
  const cy = container.height / 2;
  const center = percentToLatLon(alignment, ((cx - rect.x) / rect.width) * 100, ((cy - rect.y) / rect.height) * 100);

  // A north-up map at s px/m draws (e, n) at s*(e, -n). A = L * diag(1/s, -1/s), with det A = 1.
  const s = Math.sqrt(-detL);
  const A = [
    [L[0][0] / s, -L[0][1] / s],
    [L[1][0] / s, -L[1][1] / s],
  ];
  // Take the rotation out of A: A = C * R(phi), where C is close to the identity.
  const phi = Math.atan2(A[1]![0]! - A[0]![1]!, A[0]![0]! + A[1]![1]!);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // C = A * R(-phi), with R(t) = [[cos t, -sin t], [sin t, cos t]] (y down).
  const C = [
    [A[0]![0]! * cos - A[0]![1]! * sin, A[0]![0]! * sin + A[0]![1]! * cos],
    [A[1]![0]! * cos - A[1]![1]! * sin, A[1]![0]! * sin + A[1]![1]! * cos],
  ];

  // The map element must still cover the container after C is applied.
  const detC = C[0]![0]! * C[1]![1]! - C[0]![1]! * C[1]![0]!;
  const inv = [
    [C[1]![1]! / detC, -C[0]![1]! / detC],
    [-C[1]![0]! / detC, C[0]![0]! / detC],
  ];
  let hw = 0;
  let hh = 0;
  for (const [x, y] of [
    [cx, cy],
    [cx, -cy],
  ] as const) {
    hw = Math.max(hw, Math.abs(inv[0]![0]! * x + inv[0]![1]! * y));
    hh = Math.max(hh, Math.abs(inv[1]![0]! * x + inv[1]![1]! * y));
  }
  const width = Math.ceil(2 * hw * 1.05);
  const height = Math.ceil(2 * hh * 1.05);
  // Below 1 only when the area itself is larger than the cap: then it renders smaller and is scaled up.
  const oversample = Math.min(Math.max(1, scale), maxCanvasPx / Math.max(width, height));

  const zoom = Math.log2((s * 360 * M_PER_DEG * Math.cos((center.lat * Math.PI) / 180)) / WORLD_PX) + Math.log2(oversample);
  // With bearing b, MapLibre rotates the map by -b on screen; we need it rotated by phi.
  const bearing = (-phi * 180) / Math.PI;
  const k = oversample;
  const r = (n: number) => Number(n.toFixed(6));
  return {
    center,
    zoom,
    bearing,
    oversample,
    box: { x: cx - (width * k) / 2, y: cy - (height * k) / 2, width: width * k, height: height * k },
    transform: `matrix(${r(C[0]![0]! / k)}, ${r(C[1]![0]! / k)}, ${r(C[0]![1]! / k)}, ${r(C[1]![1]! / k)}, 0, 0)`,
  };
}

/** The image's corners as positions: top left, top right, bottom right, bottom left. */
export function imageCorners(alignment: Alignment): [LatLon, LatLon, LatLon, LatLon] {
  return [
    percentToLatLon(alignment, 0, 0),
    percentToLatLon(alignment, 100, 0),
    percentToLatLon(alignment, 100, 100),
    percentToLatLon(alignment, 0, 100),
  ];
}

export interface SnapshotOptions {
  /** Extra basemap on every side, as a multiple of the image's longer side. */
  margin?: number;
  /** Render this many times the on-screen size, so it stays sharp when zoomed in. */
  detail?: number;
  maxCanvasPx?: number;
}

/**
 * The frame for a one-time basemap picture under the dispatch map (D60):
 * the image plus `margin` on every side, rendered at `detail` times the
 * on-screen size (capped). `box` is in the same container pixels as `rect`.
 */
export function snapshotFrame(alignment: Alignment, rect: Box, { margin = 1, detail = 2, maxCanvasPx = 4096 }: SnapshotOptions = {}): BasemapFrame | null {
  const m = margin * Math.max(rect.width, rect.height);
  const area = { width: rect.width + 2 * m, height: rect.height + 2 * m };
  const f = basemapFrame(alignment, { x: m, y: m, width: rect.width, height: rect.height }, area, detail, maxCanvasPx);
  if (!f) return null;
  return { ...f, box: { ...f.box, x: f.box.x + rect.x - m, y: f.box.y + rect.y - m } };
}
