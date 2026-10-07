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
export const DEFAULT_BASEMAP_ID = 'positron';

const OSM_CREDIT = '© OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap';

const blankStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1b1d22' } }],
};

const NONE: BasemapOption = { id: NO_BASEMAP_ID, label: 'No basemap', style: blankStyle, attribution: '' };

const OPENFREEMAP: BasemapOption[] = [
  { id: 'positron', label: 'Light (Positron)', style: 'https://tiles.openfreemap.org/styles/positron', attribution: OSM_CREDIT },
  { id: 'liberty', label: 'Streets (Liberty)', style: 'https://tiles.openfreemap.org/styles/liberty', attribution: OSM_CREDIT },
  { id: 'bright', label: 'Bright', style: 'https://tiles.openfreemap.org/styles/bright', attribution: OSM_CREDIT },
  { id: 'dark', label: 'Dark', style: 'https://tiles.openfreemap.org/styles/dark', attribution: OSM_CREDIT },
  { id: 'fiord', label: 'Dark blue (Fiord)', style: 'https://tiles.openfreemap.org/styles/fiord', attribution: OSM_CREDIT },
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
 * - unset: No basemap plus the OpenFreeMap styles;
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
  return [NONE, ...OPENFREEMAP.filter((o) => !replaced.has(o.id)), ...extras];
}

/** The configured basemaps for this build. */
export const BASEMAPS: BasemapOption[] = basemapOptions(process.env.NEXT_PUBLIC_TAK_BASEMAPS);

/** A known basemap id, or the fallback when the id is unknown (e.g. removed by configuration). */
export function resolveBasemap(id: string | null | undefined, fallback = DEFAULT_BASEMAP_ID, options = BASEMAPS): BasemapOption {
  return options.find((o) => o.id === id) ?? options.find((o) => o.id === fallback) ?? options[0]!;
}
