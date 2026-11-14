import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap choices for aligning event maps, the dispatch map underlay and the
 * history view (D55). The built-in styles come from OpenFreeMap (no key, no
 * usage limits, OpenStreetMap data). A deployment can add its own styles or
 * raster tiles (for example satellite imagery from a provider it has a
 * license for) with NEXT_PUBLIC_TAK_BASEMAPS, or turn external basemaps off.
 */

export interface BasemapOption {
  id: string;
  label: string;
  /** A MapLibre style URL or an inline style. */
  style: string | StyleSpecification;
  /** Plain-text credit shown with the map. Empty for no basemap. */
  attribution: string;
}

export const NO_BASEMAP_ID = 'none';
/** Follows CrowdCAD's light or dark mode: Light (Positron) or Dark. The default. */
export const AUTO_BASEMAP_ID = 'auto';
export const DEFAULT_BASEMAP_ID = AUTO_BASEMAP_ID;
/** The dispatch map's basemap under an aligned event map: on, following the theme, unless the viewer turns it off. */
export const DEFAULT_UNDERLAY_ID = AUTO_BASEMAP_ID;
const LIGHT_ID = 'positron';
const DARK_ID = 'dark';

const OSM_CREDIT = '© OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap';

const blankStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1b1d22' } }],
};

const NONE: BasemapOption = { id: NO_BASEMAP_ID, label: 'No basemap', style: blankStyle, attribution: '' };

const OPENFREEMAP: BasemapOption[] = [
  { id: LIGHT_ID, label: 'Light', style: 'https://tiles.openfreemap.org/styles/positron', attribution: OSM_CREDIT },
  // OpenFreeMap's "dark" style is nearly black (#0c0c0c), the same as CrowdCAD's dark theme, so streets around
  // an event map disappear; "fiord" is a dark blue-gray that stays readable on it.
  { id: DARK_ID, label: 'Dark', style: 'https://tiles.openfreemap.org/styles/fiord', attribution: OSM_CREDIT },
  { id: 'liberty', label: 'Streets', style: 'https://tiles.openfreemap.org/styles/liberty', attribution: OSM_CREDIT },
];

/** One entry of NEXT_PUBLIC_TAK_BASEMAPS: a style URL, or raster tiles. */
interface ExtraBasemap {
  id?: unknown;
  label?: unknown;
  style?: unknown;
  tiles?: unknown;
  tileSize?: unknown;
  maxzoom?: unknown;
  attribution?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function fromExtra(e: ExtraBasemap): BasemapOption | null {
  const id = str(e.id);
  const label = str(e.label);
  if (!id || !label || id === NO_BASEMAP_ID) return null;
  const attribution = str(e.attribution) ?? '';
  const style = str(e.style);
  if (style) return { id, label, style, attribution };
  const tiles = str(e.tiles);
  if (!tiles) return null;
  return {
    id,
    label,
    attribution,
    style: {
      version: 8,
      sources: {
        raster: {
          type: 'raster',
          tiles: [tiles],
          tileSize: typeof e.tileSize === 'number' ? e.tileSize : 256,
          maxzoom: typeof e.maxzoom === 'number' ? e.maxzoom : 19,
          ...(attribution ? { attribution } : {}),
        },
      },
      layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
    },
  };
}

/**
 * The basemaps offered, from NEXT_PUBLIC_TAK_BASEMAPS:
 * - unset: the OpenFreeMap styles (Light, Dark, Streets) plus No basemap;
 * - "off": No basemap only (no requests to outside map services);
 * - a JSON array: the OpenFreeMap styles plus these entries, each
 *   {"id","label","style"} or {"id","label","tiles","attribution"}.
 *   Entries with the id of a built-in style replace it.
 */
export function basemapOptions(setting: string | undefined): BasemapOption[] {
  const value = setting?.trim();
  if (value === 'off') return [NONE];
  let extras: BasemapOption[] = [];
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) extras = parsed.flatMap((e) => (e && typeof e === 'object' ? [fromExtra(e as ExtraBasemap)] : [])).filter((e): e is BasemapOption => !!e);
    } catch {
      // A malformed setting falls back to the built-in styles.
    }
  }
  const replaced = new Set(extras.map((e) => e.id));
  return [...OPENFREEMAP.filter((o) => !replaced.has(o.id)), ...extras, NONE];
}

/** What the picker lists: "System" (Light or Dark, following the theme) first when both exist. */
export function basemapChoices(options = BASEMAPS): { id: string; label: string }[] {
  const auto = options.some((o) => o.id === LIGHT_ID) && options.some((o) => o.id === DARK_ID);
  return [...(auto ? [{ id: AUTO_BASEMAP_ID, label: 'System' }] : []), ...options.map(({ id, label }) => ({ id, label }))];
}

/** The configured basemaps for this build. */
export const BASEMAPS: BasemapOption[] = basemapOptions(process.env.NEXT_PUBLIC_TAK_BASEMAPS);

/**
 * A known basemap for an id, "auto" resolved for the current theme; the
 * fallback when the id is unknown (e.g. removed by configuration).
 */
export function resolveBasemap(
  id: string | null | undefined,
  fallback: string = DEFAULT_BASEMAP_ID,
  options = BASEMAPS,
  dark = false,
): BasemapOption {
  const find = (x: string | null | undefined) =>
    x === AUTO_BASEMAP_ID ? options.find((o) => o.id === (dark ? DARK_ID : LIGHT_ID)) : options.find((o) => o.id === x);
  return find(id) ?? find(fallback) ?? options[0]!;
}

/** `id` when the picker offers it, otherwise `fallback` (e.g. a stored choice removed by configuration). */
export function validChoice(id: string | null | undefined, fallback: string, options = BASEMAPS): string {
  const ids = basemapChoices(options).map((c) => c.id);
  return id && ids.includes(id) ? id : ids.includes(fallback) ? fallback : ids[0]!;
}
