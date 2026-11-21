/**
 * What the dispatch Map tab shows (#136). Each viewer can hide kinds of
 * markers; it changes only what they see, never event data, and is kept in
 * this browser (src/lib/geo/prefs.ts).
 */

export const MAP_LAYER_KINDS = ['zones', 'posts', 'teams', 'supervisors', 'equipment'] as const;
export type MapLayerKind = (typeof MAP_LAYER_KINDS)[number];

export const MAP_LAYER_LABELS: Record<MapLayerKind, string> = {
  zones: 'Zones',
  posts: 'Locations',
  teams: 'Teams',
  supervisors: 'Supervisors',
  equipment: 'Equipment',
};

/** Keeps only known kinds, once each (a stored value may be from an older or newer version). */
export function cleanHidden(value: unknown): MapLayerKind[] {
  if (!Array.isArray(value)) return [];
  return MAP_LAYER_KINDS.filter((k) => value.includes(k));
}

/** `hidden` with `kind` shown or hidden. */
export function setLayerShown(hidden: readonly MapLayerKind[], kind: MapLayerKind, shown: boolean): MapLayerKind[] {
  const out = new Set(hidden);
  if (shown) out.delete(kind);
  else out.add(kind);
  return MAP_LAYER_KINDS.filter((k) => out.has(k));
}
