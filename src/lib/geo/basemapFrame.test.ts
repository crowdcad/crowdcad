import { describe, expect, it } from 'vitest';
import { fitAffine, latLonToPercent, percentToLatLon, toLocalMeters } from './affine';
import { basemapFrame, imageCorners, pxPerMeter, snapshotFrame } from './basemapFrame';
import type { ControlPoint, LatLon } from './types';

/** Builds an alignment for a W x H image rotated by `deg`, `mPerPx` meters per pixel, with optional shear. */
function synthetic(deg: number, mPerPx: number, shear = 0) {
  const origin = { lat: 37.77, lon: -122.48 };
  const W = 2000;
  const H = 1200;
  const rad = (deg * Math.PI) / 180;
  const pts: ControlPoint[] = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
    [W / 2, H / 3],
  ].map(([px, py]) => {
    // Image pixels to meters: x right, y down; rotate by deg, then shear.
    const ex = (px! - W / 2) * mPerPx;
    const ny = -(py! - H / 2) * mPerPx;
    const e = ex * Math.cos(rad) - ny * Math.sin(rad) + shear * ny;
    const n = ex * Math.sin(rad) + ny * Math.cos(rad);
    return {
      x: (px! / W) * 100,
      y: (py! / H) * 100,
      lat: origin.lat + n / 111_195,
      lon: origin.lon + e / (111_195 * Math.cos((origin.lat * Math.PI) / 180)),
    };
  });
  const fit = fitAffine(pts, W, H);
  if ('error' in fit) throw new Error(fit.error);
  return fit;
}

/** Where MapLibre plus the CSS transform would draw `p`, in container pixels. */
function drawn(frame: NonNullable<ReturnType<typeof basemapFrame>>, p: LatLon) {
  const { e, n } = toLocalMeters(frame.center, p);
  const s = pxPerMeter(frame.zoom, frame.center.lat);
  const th = (-frame.bearing * Math.PI) / 180;
  // Map element pixels relative to its center (y down), after rotating by -bearing.
  const vx = Math.cos(th) * s * e - Math.sin(th) * -s * n;
  const vy = Math.sin(th) * s * e + Math.cos(th) * -s * n;
  const m = frame.transform.match(/matrix\(([^)]+)\)/)![1]!.split(',').map(Number);
  const [a, b, c, d] = m as [number, number, number, number];
  const cx = frame.box.x + frame.box.width / 2;
  const cy = frame.box.y + frame.box.height / 2;
  return { x: cx + a * vx + c * vy, y: cy + b * vx + d * vy };
}

const rect = { x: 40, y: 20, width: 1000, height: 600 };
const container = { width: 1080, height: 640 };

describe('basemapFrame', () => {
  for (const [deg, shear] of [
    [0, 0],
    [30, 0],
    [-75, 0],
    [160, 0.05],
  ] as const) {
    it(`draws positions where the image has them (rotation ${deg}°, shear ${shear})`, () => {
      const fit = synthetic(deg, 0.25, shear);
      const frame = basemapFrame(fit, rect, container, 1)!;
      for (const [px, py] of [
        [0, 0],
        [100, 0],
        [50, 50],
        [12, 88],
        [100, 100],
      ] as const) {
        const p = percentToLatLon(fit, px, py);
        const want = { x: rect.x + (px / 100) * rect.width, y: rect.y + (py / 100) * rect.height };
        const got = drawn(frame, p);
        expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(0.5);
      }
    });
  }

  it('keeps labels upright: the CSS part has no rotation left', () => {
    const frame = basemapFrame(synthetic(40, 0.3), rect, container)!;
    const [a, b, c, d] = frame.transform.match(/matrix\(([^)]+)\)/)![1]!.split(',').map(Number) as [number, number, number, number];
    expect(Math.abs(b - c)).toBeLessThan(1e-6);
    expect(a).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(0);
    expect(frame.bearing).toBeCloseTo(-40, 4);
  });

  it('covers the whole container', () => {
    const frame = basemapFrame(synthetic(45, 0.3), rect, container)!;
    expect(frame.box.width).toBeGreaterThanOrEqual(container.width);
    expect(frame.box.height).toBeGreaterThanOrEqual(container.height);
  });

  it('renders larger when zoomed in, within the canvas cap, at the same place', () => {
    const fit = synthetic(20, 0.25);
    const p = percentToLatLon(fit, 30, 70);
    const base = drawn(basemapFrame(fit, rect, container, 1)!, p);
    const zoomed = basemapFrame(fit, rect, container, 3)!;
    expect(zoomed.oversample).toBeGreaterThan(1);
    expect(Math.max(zoomed.box.width, zoomed.box.height)).toBeLessThanOrEqual(4096 + 1);
    const at = drawn(zoomed, p);
    expect(Math.hypot(at.x - base.x, at.y - base.y)).toBeLessThan(0.5);
  });

  it('refuses a mirrored alignment or an empty layout', () => {
    const fit = synthetic(0, 0.25);
    const mirrored = { ...fit, transform: { ...fit.transform, a: -fit.transform.a, d: -fit.transform.d } };
    expect(basemapFrame(mirrored, rect, container)).toBeNull();
    expect(basemapFrame(fit, { ...rect, width: 0 }, container)).toBeNull();
  });
});

describe('imageCorners', () => {
  it('returns the corners in order', () => {
    const fit = synthetic(10, 0.25);
    const corners = imageCorners(fit);
    const pct = corners.map((c) => latLonToPercent(fit, c));
    const want = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    pct.forEach((p, i) => {
      expect(p.x).toBeCloseTo(want[i]![0]!, 6);
      expect(p.y).toBeCloseTo(want[i]![1]!, 6);
    });
  });
});

describe('snapshotFrame', () => {
  it('covers the image plus the margin on every side, at the same positions as the live frame', () => {
    const fit = synthetic(25, 0.25);
    const snap = snapshotFrame(fit, rect, { margin: 1, detail: 2 })!;
    const live = basemapFrame(fit, rect, container, 1)!;
    // The rendered area spans at least 3x the image's longer side (before the near-identity CSS transform).
    expect(snap.box.width / snap.oversample).toBeGreaterThanOrEqual(3 * rect.width * 0.95);
    for (const [px, py] of [
      [0, 0],
      [100, 100],
      [-80, 50],
      [180, -60],
    ] as const) {
      const p = percentToLatLon(fit, px, py);
      const a = drawn(snap, p);
      const want = { x: rect.x + (px / 100) * rect.width, y: rect.y + (py / 100) * rect.height };
      expect(Math.hypot(a.x - want.x, a.y - want.y)).toBeLessThan(0.5);
      if (px >= 0 && px <= 100) {
        const b = drawn(live, p);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
      }
    }
  });

  it('stays within the canvas cap', () => {
    const snap = snapshotFrame(synthetic(10, 0.25), { x: 0, y: 0, width: 1800, height: 1200 }, { margin: 1, detail: 4 })!;
    expect(Math.max(snap.box.width, snap.box.height)).toBeLessThanOrEqual(4096 + 1);
  });
});
