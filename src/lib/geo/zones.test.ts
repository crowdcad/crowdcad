import { describe, expect, it } from 'vitest';
import type { Layer } from '@/app/types';
import { findZonesForPost } from '@/lib/zones';
import { alignmentFromBounds } from './layers';

const mapUrl = 'https://x/map.png';
const alignment = alignmentFromBounds({ north: 37.772, south: 37.768, east: -122.476, west: -122.484 }, { mapUrl, naturalWidth: 1600, naturalHeight: 900 }, 'u')!;

describe('zone membership on geo layers', () => {
  it('finds a zone for a post outside the image, by coordinates', () => {
    const layer: Layer = {
      id: 'l', name: 'Floor 1', mapUrl, alignment,
      posts: [{ name: 'Car park', x: null, y: null, lat: 37.775, lng: -122.48 }],
      zones: [{ id: 'z', name: 'North lot', color: '#f00', points: [], coords: [
        { lat: 37.774, lng: -122.482 }, { lat: 37.776, lng: -122.482 }, { lat: 37.776, lng: -122.478 }, { lat: 37.774, lng: -122.478 },
      ] }],
    };
    expect(findZonesForPost('Car park', [layer]).map((z) => z.id)).toEqual(['z']);
  });

  it('uses image positions for zones drawn on the image, through the alignment', () => {
    const layer: Layer = {
      id: 'l', name: 'Floor 1', mapUrl, alignment,
      posts: [{ name: 'Gate', x: 25, y: 25 }],
      zones: [{ id: 'west', name: 'West', color: '#0f0', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }] }],
    };
    expect(findZonesForPost('Gate', [layer]).map((z) => z.id)).toEqual(['west']);
  });

  it('a drawn-area layer works without any image positions', () => {
    const layer: Layer = {
      id: 'a', name: 'Area', posts: [{ name: 'Tent', x: null, y: null, lat: 1.5, lng: 1.5 }],
      area: { polygon: [{ lat: 0, lng: 0 }, { lat: 3, lng: 0 }, { lat: 3, lng: 3 }] },
      zones: [{ id: 'z', name: 'All', color: '#00f', points: [], coords: [{ lat: 1, lng: 1 }, { lat: 2, lng: 1 }, { lat: 2, lng: 2 }, { lat: 1, lng: 2 }] }],
    };
    expect(findZonesForPost('Tent', [layer]).map((z) => z.id)).toEqual(['z']);
  });
});
