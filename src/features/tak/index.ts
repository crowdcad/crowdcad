/**
 * TAK live tracking: the module's only public entry (in development,
 * optional). Core code outside src/features/tak may import from here only,
 * and only with a dynamic import (or `import type`), so standard event pages
 * never load TAK code. Every core call site also checks
 * `process.env.NEXT_PUBLIC_TAK === 'on'` inline, so builds without the flag
 * compile TAK out entirely. See docs/tak-integration/plan.md.
 */
export { TAK_MODULE_MARKER } from './marker';
export type { AffineTransform, ControlPoint, HistoryMode, LatLon, TakMapAlignment } from './types';

// Components, each used by one core touchpoint.
export { default as AlignMap, type AlignMapProps } from './components/AlignMap';
export { default as TakLiveMarkers, type TakLiveMarkersProps } from './components/TakLiveMarkers'; // (a) map overlay
export { default as TakEventPanel, type TakEventPanelProps } from './components/TakEventPanel'; // (a) map overlay
export { default as TakMapModeChoice, type TakMapModeChoiceProps } from './components/TakMapModeChoice'; // (b) event creation
export { default as TakAdminSection, type TakAdminSectionProps } from './components/TakAdminSection'; // (c) Admin settings
export { onEventEnded } from './lifecycle'; // (d) end-event flow

export { alignmentMatches, deleteAlignment, loadAlignments, saveAlignment } from './data/alignmentStore';
export { fitAffine, latLonToPercent, percentToLatLon, parseLatLon } from './lib/affine';
