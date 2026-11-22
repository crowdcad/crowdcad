export type EquipmentIconType = 'wheelchair' | 'stretcher' | 'aed' | 'radio' | 'briefcase';

/**
 * Classifies an equipment item's icon by name — the exact matching rules the
 * venue map's EquipmentMarker uses (see venuemapmodal.tsx's EquipmentIcon),
 * shared here so anywhere else that needs "which icon represents this piece
 * of equipment" (e.g. the dispatch page's equipment-run team pills) stays in
 * sync with the map by construction rather than by copy-paste.
 */
export function getEquipmentIconType(name: string): EquipmentIconType {
  const lower = name.toLowerCase();
  if (lower.includes('wheelchair')) return 'wheelchair';
  if (lower.includes('gurney') || lower.includes('stretcher')) return 'stretcher';
  if (lower.includes('aed')) return 'aed';
  if (lower.includes('radio')) return 'radio';
  return 'briefcase';
}
