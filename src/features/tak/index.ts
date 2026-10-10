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
export { default as TakEventPanel, type TakEventPanelProps } from './components/TakEventPanel'; // (a) map overlay
export { default as TakEventAgent, type TakEventAgentProps } from './components/TakEventAgent'; // (a) headless, D46; reports live positions, D66
export { default as TakBasemapUnderlay, type TakBasemapUnderlayProps } from './components/TakBasemapUnderlay'; // (j) map underlay, D56
export { default as TakBasemapToolbar, type TakBasemapToolbarProps } from './components/TakBasemapToolbar'; // (j) underlay controls, Map tab top bar
export { default as TakEventSummary, type TakEventSummaryProps } from './components/TakEventSummary'; // (k) event summary, D57
export { default as TakMapModeChoice, type TakMapModeChoiceProps } from './components/TakMapModeChoice'; // (b) event creation
export { default as TakAdminSection, type TakAdminSectionProps } from './components/TakAdminSection'; // (c) Admin settings
export { onEventEnded } from './lifecycle'; // (d) end-event flow
export { saveEventConfig, type TakEventConfig } from './data/takStore'; // (b) a new event's TAK config, saved once the event exists

export { alignmentFor, alignmentMatches, deleteAlignment, loadAlignments, saveAlignment } from './data/alignmentStore';
