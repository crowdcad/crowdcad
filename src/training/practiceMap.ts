import raw from './maps/practice-map.json';

/**
 * The training map, drawn in any GeoJSON editor (geojson.io works: open
 * src/training/maps/practice-map.json, draw, then save over it as GeoJSON,
 * keeping the .json name). Each feature says what it is with one property:
 *
 * - Point `{"Location": "Sather Gate"}`: a post.
 * - Point `{"Clinic": "South Clinic"}`: a clinic (a post that is a clinic, with its own tab).
 * - Polygon `{"Zone": "Glade"}`: a zone (MCI zones come from these). Optional `"color"` or `"fill"`.
 * - Polygon `{"Area": "Campus"}` (optional): the event's map area. Without one, the area is
 *   the box around everything, with a margin.
 * - LineString `{"TAKPath": "MRC2"}`: the route that team's marker follows when it travels to a
 *   call or post near the line's end (TAK modules). Draw it from the team's post toward the
 *   destination.
 *
 * The names the module scripts use (posts, the main clinic, the MCI zone, team paths) are checked
 * against this file by src/training/modules.test.ts, so a renamed place fails the tests with its name.
 */

export type LatLng = { lat: number; lng: number };

export interface PracticeMap {
  posts: { name: string; lat: number; lng: number }[];
  clinics: { name: string; lat: number; lng: number }[];
  zones: { name: string; color?: string; coords: LatLng[] }[];
  area: LatLng[];
  /** Team name to the route its marker follows when travelling. */
  paths: Record<string, LatLng[]>;
  /** Features this loader didn't recognise (shown by the tests). */
  unknown: string[];
}

type Geometry = { type: string; coordinates: unknown };
type Feature = { type?: string; properties?: Record<string, unknown> | null; geometry?: Geometry | null };

const toLatLng = ([lng, lat]: number[]): LatLng => ({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });

/** A polygon's outer ring, without GeoJSON's closing point. */
function ring(coords: unknown): LatLng[] {
  const outer = ((coords as number[][][])[0] ?? []).map(toLatLng);
  const [first, last] = [outer[0], outer[outer.length - 1]];
  return outer.length > 1 && first.lat === last.lat && first.lng === last.lng ? outer.slice(0, -1) : outer;
}

/** A property by name, any case ("TAKPath", "takpath"). */
function prop(props: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const [k, v] of Object.entries(props)) {
    if (names.includes(k.toLowerCase()) && typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function boundsArea(points: LatLng[]): LatLng[] {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const padLat = Math.max((n - s) * 0.15, 0.0005);
  const padLng = Math.max((e - w) * 0.15, 0.0005);
  const r = (x: number) => +x.toFixed(6);
  return [
    { lat: r(n + padLat), lng: r(w - padLng) },
    { lat: r(n + padLat), lng: r(e + padLng) },
    { lat: r(s - padLat), lng: r(e + padLng) },
    { lat: r(s - padLat), lng: r(w - padLng) },
  ];
}

export function parsePracticeMap(geojson: { features?: Feature[] }): PracticeMap {
  const map: PracticeMap = { posts: [], clinics: [], zones: [], area: [], paths: {}, unknown: [] };
  let area: LatLng[] | undefined;
  for (const f of geojson.features ?? []) {
    const props = f.properties ?? {};
    const g = f.geometry;
    const label = JSON.stringify(props);
    if (!g) {
      map.unknown.push(label);
      continue;
    }
    if (g.type === 'Point') {
      const at = toLatLng(g.coordinates as number[]);
      const clinic = prop(props, 'clinic');
      const post = prop(props, 'location', 'post');
      if (clinic) map.clinics.push({ name: clinic, ...at });
      else if (post) map.posts.push({ name: post, ...at });
      else map.unknown.push(label);
    } else if (g.type === 'Polygon') {
      const zone = prop(props, 'zone');
      if (zone) map.zones.push({ name: zone, color: prop(props, 'color', 'fill'), coords: ring(g.coordinates) });
      else if (prop(props, 'area')) area = ring(g.coordinates);
      else map.unknown.push(label);
    } else if (g.type === 'LineString') {
      const team = prop(props, 'takpath', 'path', 'team');
      if (team) map.paths[team] = (g.coordinates as number[][]).map(toLatLng);
      else map.unknown.push(label);
    } else {
      map.unknown.push(label);
    }
  }
  const everything = [...map.posts, ...map.clinics, ...map.zones.flatMap((z) => z.coords), ...Object.values(map.paths).flat()];
  map.area = area ?? boundsArea(everything);
  return map;
}

export const PRACTICE_MAP: PracticeMap = parsePracticeMap(raw as { features?: Feature[] });

/** Rough metres between two points (fine at venue scale). */
export function metres(a: LatLng, b: LatLng): number {
  const k = 111_320;
  const dx = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (b.lat - a.lat) * k;
  return Math.hypot(dx, dy);
}

/** The point a fraction `f` (0 to 1) of the way along a route, by distance. */
export function alongRoute(route: LatLng[], f: number): LatLng {
  if (route.length === 0) throw new Error('empty route');
  if (route.length === 1 || f <= 0) return route[0];
  if (f >= 1) return route[route.length - 1];
  const legs = route.slice(1).map((p, i) => metres(route[i], p));
  let left = legs.reduce((s, d) => s + d, 0) * f;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] || i === legs.length - 1) {
      const t = legs[i] ? Math.min(1, left / legs[i]) : 1;
      const [a, b] = [route[i], route[i + 1]];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    left -= legs[i];
  }
  return route[route.length - 1];
}
