import { describe, expect, it, vi } from 'vitest';
import { basemapOptions, NO_BASEMAP_ID, resolveBasemap } from './basemaps';
import { geocoderUrl, parsePhotonResults, searchPlaces } from './geocode';

describe('basemapOptions', () => {
  it('offers no basemap plus the OpenFreeMap styles by default', () => {
    const ids = basemapOptions(undefined).map((o) => o.id);
    expect(ids).toEqual([NO_BASEMAP_ID, 'positron', 'liberty', 'bright', 'dark', 'fiord']);
  });

  it('"off" leaves only no basemap', () => {
    expect(basemapOptions(' off ').map((o) => o.id)).toEqual([NO_BASEMAP_ID]);
  });

  it('adds raster tiles and style URLs from JSON, and lets an entry replace a built-in', () => {
    const opts = basemapOptions(
      JSON.stringify([
        { id: 'satellite', label: 'Satellite', tiles: 'https://tiles.example.org/{z}/{x}/{y}.jpg', attribution: 'Example imagery' },
        { id: 'positron', label: 'Light (own server)', style: 'https://maps.example.org/positron.json' },
        { id: 'broken' },
        { id: NO_BASEMAP_ID, label: 'x', style: 'y' },
      ]),
    );
    expect(opts.map((o) => o.id)).toEqual([NO_BASEMAP_ID, 'liberty', 'bright', 'dark', 'fiord', 'satellite', 'positron']);
    const sat = opts.find((o) => o.id === 'satellite')!;
    expect(sat.attribution).toBe('Example imagery');
    expect(typeof sat.style).toBe('object');
    expect(opts.find((o) => o.id === 'positron')!.style).toBe('https://maps.example.org/positron.json');
  });

  it('ignores a malformed setting', () => {
    expect(basemapOptions('{not json').length).toBe(6);
  });

  it('resolves unknown ids to the fallback', () => {
    const opts = basemapOptions(undefined);
    expect(resolveBasemap('gone', 'positron', opts).id).toBe('positron');
    expect(resolveBasemap('gone', 'positron', basemapOptions('off')).id).toBe(NO_BASEMAP_ID);
  });
});

describe('place search', () => {
  it('reads Photon results with labels and extents', () => {
    const results = parsePhotonResults({
      features: [
        {
          geometry: { coordinates: [-122.48, 37.77] },
          properties: { name: 'Golden Gate Park', city: 'San Francisco', state: 'CA', country: 'United States', extent: [-122.51, 37.77, -122.45, 37.76] },
        },
        { geometry: { coordinates: [-122.4, 37.8] }, properties: { housenumber: '1', street: 'Main St', city: 'Town' } },
        { geometry: {}, properties: { name: 'no point' } },
      ],
    });
    expect(results).toEqual([
      { label: 'Golden Gate Park, San Francisco, CA, United States', lat: 37.77, lon: -122.48, bbox: [-122.51, 37.76, -122.45, 37.77] },
      { label: '1 Main St, Town', lat: 37.8, lon: -122.4 },
    ]);
    expect(parsePhotonResults(null)).toEqual([]);
  });

  it('takes typed coordinates without a request', async () => {
    const f = vi.fn();
    expect(await searchPlaces(' 37.7694, -122.4862 ', undefined, f)).toEqual([{ label: '37.7694, -122.4862', lat: 37.7694, lon: -122.4862 }]);
    expect(f).not.toHaveBeenCalled();
  });

  it('asks the geocoder, biased toward the current view', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    await searchPlaces('stadium', { lat: 37.77123, lon: -122.48 }, f as unknown as typeof fetch);
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/^https:\/\/photon\.komoot\.io\/api\/\?q=stadium&limit=6&lat=37\.7712&lon=-122\.4800$/);
  });

  it('explains a failed search', async () => {
    const f = vi.fn(async () => new Response('', { status: 503 }));
    await expect(searchPlaces('x', undefined, f as unknown as typeof fetch)).rejects.toThrow('HTTP 503');
  });

  it('can be turned off or pointed elsewhere', () => {
    expect(geocoderUrl('off')).toBeNull();
    expect(geocoderUrl('https://geo.example.org/')).toBe('https://geo.example.org');
    expect(geocoderUrl(undefined)).toBe('https://photon.komoot.io');
  });
});
