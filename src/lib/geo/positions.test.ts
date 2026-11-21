import { describe, expect, it } from 'vitest';
import type { Layer } from '@/app/types';
import { alignmentFromBounds } from './layers';
import { imagePercentFor, postAt, postLatLng, withCoordinates, zoneLatLngs, zonePointsFor } from './positions';

const bounds = { north: 37.772, south: 37.768, east: -122.476, west: -122.484 };
const mapUrl = 'https://x/map.png';
const alignment = alignmentFromBounds(bounds, { mapUrl, naturalWidth: 1600, naturalHeight: 900 }, 'u1')!;
const center = { lat: 37.77, lng: -122.48 };

const aligned = (extra: Partial<Layer> = {}): Layer => ({ id: 'l1', name: 'Floor 1', mapUrl, posts: [], alignment, ...extra });

describe('posts on geo layers', () => {
  it('a post inside the image keeps an image position; outside it does not', () => {
    const inside = postAt({ name: 'Gate', x: null, y: null }, center, aligned());
    expect(inside.x).toBeCloseTo(50, 3);
    expect(inside.y).toBeCloseTo(50, 3);
    const outside = postAt({ name: 'Car park', x: 10, y: 10 }, { lat: 37.78, lng: -122.48 }, aligned());
    expect([outside.x, outside.y, outside.lat]).toEqual([null, null, 37.78]);
  });

  it('reads a post by its coordinates, else through the alignment', () => {
    expect(postLatLng({ name: 'A', x: null, y: null, lat: 1, lng: 2 }, aligned())).toEqual({ lat: 1, lng: 2 });
    const viaImage = postLatLng({ name: 'B', x: 50, y: 50 }, aligned())!;
    expect(viaImage.lat).toBeCloseTo(center.lat, 6);
    expect(viaImage.lng).toBeCloseTo(center.lng, 6);
    // On an image-only layer, GIS lat/lng is provenance, not position.
    expect(postLatLng({ name: 'C', x: 50, y: 50, lat: 1, lng: 2 }, { id: 'l2', name: 'x', mapUrl, posts: [] })).toBeNull();
  });

  it('a drawn-area layer has no image positions', () => {
    const area: Layer = { id: 'a', name: 'Area', posts: [], area: { polygon: [center, { lat: 37.771, lng: -122.48 }, { lat: 37.771, lng: -122.479 }] } };
    expect(imagePercentFor(center, area)).toBeNull();
    expect(postLatLng({ name: 'D', x: null, y: null, lat: 37.77, lng: -122.48 }, area)).toEqual(center);
    expect(zonePointsFor([center], area)).toEqual([]);
  });
});

describe('withCoordinates (saving an aligned venue)', () => {
  it('adds coordinates to image-only posts and zones, keeping their image positions', () => {
    const layer = aligned({
      posts: ['Free text', { name: 'Gate', x: 50, y: 50 }, { name: 'Done', x: 1, y: 1, lat: 5, lng: 6 }],
      zones: [{ id: 'z', name: 'North', color: '#f00', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] }],
    });
    const out = withCoordinates(layer);
    const gate = out.posts[1] as Exclude<(typeof out.posts)[number], string>;
    expect(gate.x).toBe(50);
    expect(gate.lat).toBeCloseTo(center.lat, 6);
    expect(out.posts[2]).toEqual(layer.posts[2]);
    expect(out.posts[0]).toBe('Free text');
    expect(out.zones![0]!.coords![0]!.lat).toBeCloseTo(bounds.north, 6);
    expect(zoneLatLngs(out.zones![0]!, out)).toBe(out.zones![0]!.coords);
  });

  it('leaves unaligned layers alone', () => {
    const layer: Layer = { id: 'l', name: 'x', mapUrl, posts: [{ name: 'Gate', x: 50, y: 50 }] };
    expect(withCoordinates(layer)).toBe(layer);
  });
});
