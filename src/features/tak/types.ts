// TAK integration types (in development, optional). Shapes follow
// docs/tak-integration/data-contract.md. Core code outside src/features/tak
// may import these types only through the module entry (index.ts).

export type HistoryMode = 'off' | 'summary' | 'detailed';

export type { LatLon, ControlPoint, AffineTransform } from '@/lib/geo/types';
import type { MapAlignment } from '@/lib/geo/types';

/** Map alignment for one event map layer; the core MapAlignment (P8). */
export type TakMapAlignment = MapAlignment;
