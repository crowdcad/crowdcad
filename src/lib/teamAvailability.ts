import type { Event } from '@/app/types';
import { deriveTeamVisualStatus } from '@/lib/statusColors';

export const DEFAULT_SURGE_LIMIT_PERCENT = 70;
export const DEFAULT_PENDING_TRANSPORT_SURGE_THRESHOLD = 3;
export const DEFAULT_UNASSIGNED_CALL_SURGE_SECONDS = 120;

const ON_CALL_STATUSES = new Set(['En Route', 'On Scene', 'Transporting', 'En Route Eq', 'Assisting']);
const BREAK_OR_CLINIC_STATUSES = new Set(['On Break', 'In Clinic']);

export interface TeamAvailabilitySummary {
  total: number;
  available: number;
  onBreakOrClinic: number;
  onCalls: number;
  /** Teams in a transitional/resolution status (e.g. Delivered, Refusal) — counted in `total` but not in the three buckets above. */
  other: number;
  /** Rounded 0-100. */
  percentOnCalls: number;
}

/**
 * Buckets every team's current visual status (i.e. cross-checked against
 * live call assignments via `deriveTeamVisualStatus`, not the raw possibly-stale
 * `staff.status`) into Available / On Break-Clinic / On Calls for the dispatch
 * sidebar's availability strip.
 */
export function getTeamAvailabilitySummary(event: Event): TeamAvailabilitySummary {
  const staff = event.staff || [];
  const total = staff.length;

  let available = 0;
  let onBreakOrClinic = 0;
  let onCalls = 0;

  for (const member of staff) {
    const visualStatus = deriveTeamVisualStatus(member.status, event, member.team);
    if (ON_CALL_STATUSES.has(visualStatus)) {
      onCalls += 1;
    } else if (BREAK_OR_CLINIC_STATUSES.has(visualStatus)) {
      onBreakOrClinic += 1;
    } else if (visualStatus === 'Available') {
      available += 1;
    }
  }

  const other = total - available - onBreakOrClinic - onCalls;
  const percentOnCalls = total > 0 ? Math.round((onCalls / total) * 100) : 0;

  return { total, available, onBreakOrClinic, onCalls, other, percentOnCalls };
}

export function getSurgeLimitPercent(event: Event): number {
  const value = event.surgeLimitPercent;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SURGE_LIMIT_PERCENT;
}

export function isSurging(percentOnCalls: number, surgeLimitPercent: number): boolean {
  return percentOnCalls >= surgeLimitPercent;
}

/** Combined calls+clinic pending-transport count at which a surge alert fires. Defaults to 3 when unset. */
export function getPendingTransportSurgeThreshold(event: Event): number {
  const value = event.pendingTransportSurgeThreshold;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_PENDING_TRANSPORT_SURGE_THRESHOLD;
}

/**
 * Patients waiting on an ambulance: calls-side "Pending Transport" status plus
 * clinic-side "Pending Transport" outcome. Compared against
 * getPendingTransportSurgeThreshold.
 */
export function countPendingTransport(event: Event): number {
  return (event.calls || []).filter(c => c.outcome === 'Pending Transport' || c.status === 'Pending Transport').length;
}

/** Seconds an unassigned ("Pending") call may sit before a surge alert fires. Defaults to 120 (2:00) when unset. */
export function getUnassignedCallSurgeSeconds(event: Event): number {
  const value = event.unassignedCallSurgeSeconds;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_UNASSIGNED_CALL_SURGE_SECONDS;
}
