/**
 * TAK live tracking: the module's only public entry (in development,
 * optional). Core code outside src/features/tak may import from here only,
 * and only with a dynamic import (or `import type`), so standard event pages
 * never load TAK code. See docs/tak-integration/plan.md.
 */
export { TAK_MODULE_MARKER } from './marker';
export type { AffineTransform, ControlPoint, HistoryMode, LatLon, TakMapAlignment } from './types';
export { default as AlignMap, type AlignMapProps } from './components/AlignMap';
export { alignmentMatches, deleteAlignment, loadAlignments, saveAlignment } from './data/alignmentStore';
export { fitAffine, latLonToPercent, percentToLatLon, parseLatLon } from './lib/affine';
