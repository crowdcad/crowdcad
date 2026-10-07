import type { AffineTransform, ControlPoint, LatLon } from '../types';

/**
 * Map alignment math for the TAK "Align map" step.
 *
 * Positions are converted to local meters around the control points' centroid
 * (an equirectangular projection, accurate to well under a meter across a
 * venue), and an affine transform is fitted by least squares from those
 * meters to image pixels. Pixels rather than percent keep the fit isotropic
 * on non-square images; the stored transform is converted to percent so it
 * doesn't depend on display size.
 *
 * Error reporting: with n > 3 points, the estimated error is the residual
 * standard error sqrt(SSR / (n - 3)), measured in meters by mapping each
 * point's image position back through the inverse transform. With exactly 3
 * points the fit is exact and the error can't be estimated, so it is null.
 */

const EARTH_RADIUS_M = 6_371_008.8;
export const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;

export function toLocalMeters(origin: LatLon, p: LatLon): { e: number; n: number } {
  return {
    e: (p.lon - origin.lon) * M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180),
    n: (p.lat - origin.lat) * M_PER_DEG,
  };
}

export function fromLocalMeters(origin: LatLon, e: number, n: number): LatLon {
  return {
    lat: origin.lat + n / M_PER_DEG,
    lon: origin.lon + e / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

export type FitError = 'too-few-points' | 'degenerate';

export interface AffineFit {
  origin: LatLon;
  transform: AffineTransform;
  /** Estimated error in meters; null with exactly 3 points. */
  residualM: number | null;
  /** Each control point's own residual, in meters (all 0 with 3 points). */
  pointResidualsM: number[];
}

/** Solves a 3x3 linear system by Gaussian elimination with partial pivoting. */
function solve3(m: number[][], v: number[]): number[] | null {
  const a = m.map((row, i) => [...row, v[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const k = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < 4; c++) a[r]![c]! -= k * a[col]![c]!;
    }
  }
  return [0, 1, 2].map((i) => a[i]![3]! / a[i]![i]!);
}

/**
 * Fits an affine transform from at least 3 control points.
 * Returns an error code when there are too few points, or when they are
 * (nearly) collinear in either space, so the fit would be meaningless.
 */
export function fitAffine(
  points: ControlPoint[],
  naturalWidth: number,
  naturalHeight: number,
): AffineFit | { error: FitError } {
  if (points.length < 3) return { error: 'too-few-points' };
  const origin = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
  const geo = points.map((p) => toLocalMeters(origin, p));
  const px = points.map((p) => ({ x: (p.x / 100) * naturalWidth, y: (p.y / 100) * naturalHeight }));

  if (isCollinear(geo.map((g) => [g.e, g.n])) || isCollinear(px.map((p) => [p.x, p.y]))) {
    return { error: 'degenerate' };
  }

  // Normal equations: (MᵀM) p = Mᵀb, with M rows [e, n, 1].
  const mtm = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const mtx = [0, 0, 0];
  const mty = [0, 0, 0];
  geo.forEach((g, i) => {
    const row = [g.e, g.n, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) mtm[r]![c]! += row[r]! * row[c]!;
      mtx[r]! += row[r]! * px[i]!.x;
      mty[r]! += row[r]! * px[i]!.y;
    }
  });
  const cx = solve3(mtm, mtx);
  const cy = solve3(mtm, mty);
  if (!cx || !cy) return { error: 'degenerate' };

  const pixelTransform: AffineTransform = { a: cx[0]!, b: cx[1]!, c: cx[2]!, d: cy[0]!, e: cy[1]!, f: cy[2]! };
  const det = pixelTransform.a * pixelTransform.e - pixelTransform.b * pixelTransform.d;
  if (Math.abs(det) < 1e-12) return { error: 'degenerate' };

  // Residuals in meters: map each point's pixel position back to meters.
  const pointResidualsM = px.map((p, i) => {
    const back = invert(pixelTransform, p.x, p.y);
    return Math.hypot(back.e - geo[i]!.e, back.n - geo[i]!.n);
  });
  const n = points.length;
  const ssr = pointResidualsM.reduce((s, r) => s + r * r, 0);
  const residualM = n > 3 ? Math.sqrt(ssr / (n - 3)) : null;

  const transform: AffineTransform = {
    a: (pixelTransform.a / naturalWidth) * 100,
    b: (pixelTransform.b / naturalWidth) * 100,
    c: (pixelTransform.c / naturalWidth) * 100,
    d: (pixelTransform.d / naturalHeight) * 100,
    e: (pixelTransform.e / naturalHeight) * 100,
    f: (pixelTransform.f / naturalHeight) * 100,
  };
  return { origin, transform, residualM, pointResidualsM: n > 3 ? pointResidualsM : pointResidualsM.map(() => 0) };
}

/** True if the points' spread is (nearly) one-dimensional. */
function isCollinear(pts: number[][]): boolean {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0]!, 0) / n;
  const my = pts.reduce((s, p) => s + p[1]!, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p[0]! - mx;
    const dy = p[1]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const trace = sxx + syy;
  if (trace === 0) return true;
  const det = sxx * syy - sxy * sxy;
  // Ratio of the smaller to the larger principal spread, squared-ish: small means a line.
  const minorEigen = trace / 2 - Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  return minorEigen / trace < 1e-4;
}

function invert(t: AffineTransform, x: number, y: number): { e: number; n: number } {
  const det = t.a * t.e - t.b * t.d;
  const dx = x - t.c;
  const dy = y - t.f;
  return { e: (t.e * dx - t.b * dy) / det, n: (-t.d * dx + t.a * dy) / det };
}

/** Projects a WGS84 position to image percent with a fitted alignment. */
export function latLonToPercent(alignment: { origin: LatLon; transform: AffineTransform }, p: LatLon): { x: number; y: number } {
  const { e, n } = toLocalMeters(alignment.origin, p);
  const t = alignment.transform;
  return { x: t.a * e + t.b * n + t.c, y: t.d * e + t.e * n + t.f };
}

/** Inverse of latLonToPercent. */
export function percentToLatLon(alignment: { origin: LatLon; transform: AffineTransform }, x: number, y: number): LatLon {
  const { e, n } = invert(alignment.transform, x, y);
  return fromLocalMeters(alignment.origin, e, n);
}

/**
 * Parses a position typed or pasted by a person: "37.87, -122.27",
 * "37.87 -122.27" or "37.87,-122.27". Returns null if it isn't a valid pair.
 */
export function parseLatLon(input: string): LatLon | null {
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}
