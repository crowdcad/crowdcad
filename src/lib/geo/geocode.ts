import { parseLatLon } from './affine';
import type { LatLon } from './types';

/**
 * Place search for the alignment basemap (D55). Uses a Photon geocoder
 * (OpenStreetMap data), komoot's public instance by default; a deployment can
 * point NEXT_PUBLIC_TAK_GEOCODER_URL at its own, or set it to "off".
 * Typed coordinates always work, with or without a geocoder. Searches run
 * only when the user submits, never per keystroke.
 */

export interface PlaceResult {
  label: string;
  lat: number;
  lon: number;
  /** [west, south, east, north], when the place has an extent. */
  bbox?: [number, number, number, number];
}

const DEFAULT_GEOCODER = 'https://photon.komoot.io';

export function geocoderUrl(setting: string | undefined = process.env.NEXT_PUBLIC_TAK_GEOCODER_URL): string | null {
  const v = setting?.trim();
  if (v === 'off') return null;
  return (v || DEFAULT_GEOCODER).replace(/\/+$/, '');
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown> & { extent?: [number, number, number, number] };
}

/** Results from a Photon response (GeoJSON), with readable labels. */
export function parsePhotonResults(json: unknown): PlaceResult[] {
  const features = (json as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceResult[] = [];
  for (const f of features) {
    const c = f.geometry?.coordinates;
    if (!c || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const p = f.properties ?? {};
    const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
    const street = [s('housenumber'), s('street')].filter(Boolean).join(' ');
    const parts = [s('name'), street, s('city') || s('district'), s('state'), s('country')].filter(Boolean);
    const label = [...new Set(parts)].join(', ') || `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`;
    // Photon's extent is [west, north, east, south].
    const e = p.extent;
    const bbox: PlaceResult['bbox'] =
      Array.isArray(e) && e.length === 4 && e.every((n) => typeof n === 'number') ? [e[0], e[3], e[2], e[1]] : undefined;
    out.push({ label, lat: c[1], lon: c[0], ...(bbox ? { bbox } : {}) });
  }
  return out;
}

/** Searches for a place, or reads typed coordinates. Results near `near` rank first. */
export async function searchPlaces(query: string, near?: LatLon, fetchImpl: typeof fetch = fetch): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  const coords = parseLatLon(q);
  if (coords) return [{ label: `${coords.lat}, ${coords.lon}`, ...coords }];
  const base = geocoderUrl();
  if (!base) throw new Error('Place search is turned off here. Type coordinates instead, e.g. 37.7694, -122.4862.');
  const params = new URLSearchParams({ q, limit: '6' });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lon', near.lon.toFixed(4));
  }
  const res = await fetchImpl(`${base}/api/?${params}`);
  if (!res.ok) throw new Error(`Place search failed (HTTP ${res.status}). Try again, or type coordinates.`);
  return parsePhotonResults(await res.json());
}
