import { describe, expect, it } from 'vitest';
import { latLonToPercent } from './affine';
import { alignmentFromBounds, areaBounds, isGeoLayer, layerAlignment, layerArea } from './layers';
import type { MapAlignment } from './types';

const bounds = { north: 37.772, south: 37.768, east: -122.476, west: -122.484 };
const aligned = alignmentFromBounds(bounds, { mapUrl: 'https://x/map.png', naturalWidth: 1600, naturalHeight: 900 }, 'u1')!;

describe('alignmentFromBounds', () => {
  it('puts the image corners on the bounds', () => {
    const nw = latLonToPercent(aligned, { lat: bounds.north, lon: bounds.west });
    const se = latLonToPercent(aligned, { lat: bounds.south, lon: bounds.east });
    expect(nw.x).toBeCloseTo(0, 3);
    expect(nw.y).toBeCloseTo(0, 3);
    expect(se.x).toBeCloseTo(100, 3);
    expect(se.y).toBeCloseTo(100, 3);
    // Exact corners, so the estimated error is essentially zero.
    expect(aligned.residualM!).toBeLessThan(0.5);
  });
});

describe('geo layers', () => {
  const stale: MapAlignment = { ...aligned, mapUrl: 'https://x/old.png' };

  it('an image layer is geo only while its alignment matches its image', () => {
    expect(isGeoLayer({ mapUrl: 'https://x/map.png', alignment: aligned })).toBe(true);
    expect(isGeoLayer({ mapUrl: 'https://x/map.png', alignment: stale })).toBe(false);
    expect(isGeoLayer({ mapUrl: 'https://x/map.png' })).toBe(false);
  });

  it('reads alignments saved under the older TAK name', () => {
    expect(layerAlignment({ mapUrl: 'https://x/map.png', takAlignment: aligned })).toBe(aligned);
    expect(layerAlignment({ mapUrl: 'https://x/map.png', alignment: aligned, takAlignment: stale })).toBe(aligned);
  });

  it('a drawn area makes a geo layer only with 3 or more points and no image', () => {
    const area = { polygon: [{ lat: 1, lng: 1 }, { lat: 2, lng: 1 }, { lat: 2, lng: 2 }] };
    expect(isGeoLayer({ area })).toBe(true);
    expect(layerArea({ area: { polygon: area.polygon.slice(0, 2) } })).toBeUndefined();
    expect(layerArea({ mapUrl: 'https://x/map.png', area })).toBeUndefined();
    expect(areaBounds(area)).toEqual([1, 1, 2, 2]);
  });
});
