import { describe, expect, it } from 'vitest';
import type { ControlPoint } from './types';
import { fitAffine, fromLocalMeters, latLonToPercent, parseLatLon, percentToLatLon, toLocalMeters, type AffineFit } from './affine';

/** Deterministic PRNG for reproducible noise. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/**
 * A synthetic venue map: a 2400x1600 px image covering roughly 600x400 m,
 * rotated 23 degrees from north with slightly different x/y scales (as a
 * scanned or stretched site plan would be).
 */
const W = 2400;
const H = 1600;
const venue = { lat: 45.0012, lon: -100.0021 };
const rot = (23 * Math.PI) / 180;
const sx = 4.0; // px per meter along the image x axis
const sy = 3.8;
function truePixel(lat: number, lon: number) {
  const { e, n } = toLocalMeters(venue, { lat, lon });
  const u = Math.cos(rot) * e - Math.sin(rot) * n;
  const v = Math.sin(rot) * e + Math.cos(rot) * n;
  return { x: W / 2 + sx * u, y: H / 2 - sy * v };
}
function randomPointInVenue(rand: () => number) {
  const e = (rand() - 0.5) * 500;
  const n = (rand() - 0.5) * 320;
  return fromLocalMeters(venue, e, n);
}
function controlPoints(count: number, noiseM: number, seed: number): ControlPoint[] {
  const rand = prng(seed);
  return Array.from({ length: count }, () => {
    const real = randomPointInVenue(rand);
    const px = truePixel(real.lat, real.lon);
    // The person reads a position off a phone or map, with some error.
    const { e, n } = toLocalMeters(real, real);
    const noisy = fromLocalMeters(real, e + gaussian(rand) * noiseM, n + gaussian(rand) * noiseM);
    return { x: (px.x / W) * 100, y: (px.y / H) * 100, lat: noisy.lat, lon: noisy.lon };
  });
}
function ok(fit: ReturnType<typeof fitAffine>): AffineFit {
  if ('error' in fit) throw new Error(fit.error);
  return fit;
}
/** Error in meters between where the alignment puts a coordinate and where it really is on the image. */
function placementErrorM(fit: AffineFit, lat: number, lon: number) {
  const placed = latLonToPercent(fit, { lat, lon });
  const truth = truePixel(lat, lon);
  const dxPx = (placed.x / 100) * W - truth.x;
  const dyPx = (placed.y / 100) * H - truth.y;
  return Math.hypot(dxPx / sx, dyPx / sy);
}

describe('fitAffine', () => {
  it('recovers an exact transform from 3 exact points, with no error estimate', () => {
    const fit = ok(fitAffine(controlPoints(3, 0, 1), W, H));
    expect(fit.residualM).toBeNull();
    const rand = prng(99);
    for (let i = 0; i < 20; i++) {
      const p = randomPointInVenue(rand);
      expect(placementErrorM(fit, p.lat, p.lon)).toBeLessThan(0.01);
    }
  });

  it('places known coordinates within the reported error (P3 acceptance)', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const fit = ok(fitAffine(controlPoints(8, 2, seed), W, H));
      expect(fit.residualM).not.toBeNull();
      const rand = prng(seed * 100);
      const errors = Array.from({ length: 200 }, () => {
        const p = randomPointInVenue(rand);
        return placementErrorM(fit, p.lat, p.lon);
      });
      const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
      // The residual standard error estimates the scatter of a single noisy
      // point; held-out placement error (which excludes that noise) stays below it.
      expect(rms).toBeLessThanOrEqual(fit.residualM!);
      expect(fit.residualM!).toBeGreaterThan(0.5);
      expect(fit.residualM!).toBeLessThan(6);
    }
  });

  it('reports a large error when one control point is badly wrong', () => {
    const pts = controlPoints(6, 0.5, 21);
    const bad = { ...pts[0]!, ...fromLocalMeters(pts[0]!, 40, 0) }; // 40 m off
    const fit = ok(fitAffine([bad, ...pts.slice(1)], W, H));
    expect(fit.residualM!).toBeGreaterThan(10);
    const worst = fit.pointResidualsM.indexOf(Math.max(...fit.pointResidualsM));
    expect(worst).toBe(0);
  });

  it('rejects too few or collinear points', () => {
    expect(fitAffine(controlPoints(2, 0, 3), W, H)).toEqual({ error: 'too-few-points' });
    const line: ControlPoint[] = [0, 1, 2, 3].map((i) => {
      const p = fromLocalMeters(venue, i * 50, i * 50);
      const px = truePixel(p.lat, p.lon);
      return { x: (px.x / W) * 100, y: (px.y / H) * 100, ...p };
    });
    expect(fitAffine(line, W, H)).toEqual({ error: 'degenerate' });
  });

  it('round-trips percent and lat/lon', () => {
    const fit = ok(fitAffine(controlPoints(5, 1, 31), W, H));
    const p = { lat: 45.0015, lon: -100.0011 };
    const pct = latLonToPercent(fit, p);
    const back = percentToLatLon(fit, pct.x, pct.y);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lon).toBeCloseTo(p.lon, 9);
  });

  it('does not depend on display size: the transform is in percent', () => {
    const pts = controlPoints(5, 1, 41);
    const a = ok(fitAffine(pts, W, H));
    const b = ok(fitAffine(pts, W / 2, H / 2));
    const p = { lat: 45.0012, lon: -100.002 };
    expect(latLonToPercent(a, p).x).toBeCloseTo(latLonToPercent(b, p).x, 6);
    expect(latLonToPercent(a, p).y).toBeCloseTo(latLonToPercent(b, p).y, 6);
  });
});

describe('parseLatLon', () => {
  it.each([
    ['45.0012, -100.0021', { lat: 45.0012, lon: -100.0021 }],
    ['45.0012 -100.0021', { lat: 45.0012, lon: -100.0021 }],
    ['  -33.8688,151.2093 ', { lat: -33.8688, lon: 151.2093 }],
  ])('parses %s', (input, expected) => {
    expect(parseLatLon(input)).toEqual(expected);
  });

  it.each(['', '45.0', 'north, west', '91, 10', '10, 181', '45.0, -100.0, 3'])('rejects %s', (input) => {
    expect(parseLatLon(input)).toBeNull();
  });
});
