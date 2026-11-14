import type { Event } from '@/app/types';

export type DispatchStatusColor = {
  borderClass: string;
  fillClass: string;
  textClass: string;
  chipClass: string;
  rowClass: string;
};

const DEFAULT_STATUS_COLOR: DispatchStatusColor = {
  borderClass: 'border-surface-liner',
  fillClass: 'bg-surface-liner/40',
  textClass: 'text-surface-light',
  chipClass: 'border border-surface-liner bg-surface-liner/50',
  rowClass: '',
};


/**
 * Background of the open call/clinic table row and its notes/log row. The tables sit on
 * surface-deep (the color an open team card takes), so the open row needs its own step:
 * a translucent border-gray lifts it in dark mode and dims it slightly in light mode.
 * Editable fields inside keep surface-deep (INLINE_CELL_INPUT_CLASS, TrackingTextEntry `filled`).
 */
export const TRACKING_ROW_OPEN_CLASS = 'bg-surface-liner/60';

/** Hovering a closed call/clinic row shows the open color, so clicking it does not change the color again. */
export const TRACKING_ROW_HOVER_CLASS = 'hover:bg-surface-liner/60';

export const STATUS_COLORS: Record<string, DispatchStatusColor> = {
  Available: {
    borderClass: 'border-status-card-ring-green',
    fillClass: 'bg-status-card-green',
    textClass: 'text-status-green',
    chipClass: 'border border-status-card-ring-green bg-status-card-green',
    rowClass: '',
  },
  Assigned: DEFAULT_STATUS_COLOR,
  Pending: DEFAULT_STATUS_COLOR,
  Detached: DEFAULT_STATUS_COLOR,
  Delivered: {
    borderClass: 'border-status-card-ring-green',
    fillClass: 'bg-status-card-green',
    textClass: 'text-status-green',
    chipClass: 'border border-status-card-ring-green bg-status-card-green',
    rowClass: '',
  },
  'Delivered Eq': {
    borderClass: 'border-status-card-ring-yellow',
    fillClass: 'bg-status-card-yellow',
    textClass: 'text-status-orange',
    chipClass: 'border border-status-card-ring-yellow bg-status-card-yellow',
    rowClass: '',
  },
  Refusal: DEFAULT_STATUS_COLOR,
  NMM: DEFAULT_STATUS_COLOR,
  'Treat and Release': DEFAULT_STATUS_COLOR,
  Resolved: DEFAULT_STATUS_COLOR,
  Rolled: DEFAULT_STATUS_COLOR,
  'Rolled from Scene': DEFAULT_STATUS_COLOR,
  'Unable to Locate': DEFAULT_STATUS_COLOR,
  'On Break': {
    borderClass: 'border-status-card-ring-blue',
    fillClass: 'bg-status-card-blue',
    textClass: 'text-status-blue',
    chipClass: 'border border-status-card-ring-blue bg-status-card-blue',
    rowClass: '',
  },
  'In Clinic': {
    borderClass: 'border-status-card-ring-blue',
    fillClass: 'bg-status-card-blue',
    textClass: 'text-status-blue',
    chipClass: 'border border-status-card-ring-blue bg-status-card-blue',
    rowClass: '',
  },
  // MCI mode: Triage reads as on call, Treatment as clinic, Unavailable as the default gray.
  Triage: {
    borderClass: 'border-status-card-ring-red',
    fillClass: 'bg-status-card-red',
    textClass: 'text-status-red',
    chipClass: 'border border-status-card-ring-red bg-status-card-red',
    rowClass: '',
  },
  Treatment: {
    borderClass: 'border-status-card-ring-blue',
    fillClass: 'bg-status-card-blue',
    textClass: 'text-status-blue',
    chipClass: 'border border-status-card-ring-blue bg-status-card-blue',
    rowClass: '',
  },
  Unavailable: DEFAULT_STATUS_COLOR,
  'Retrieving Eq': {
    borderClass: 'border-status-card-ring-yellow',
    fillClass: 'bg-status-card-yellow',
    textClass: 'text-status-orange',
    chipClass: 'border border-status-card-ring-yellow bg-status-card-yellow',
    rowClass: '',
  },
  'Returning Eq': {
    borderClass: 'border-status-card-ring-yellow',
    fillClass: 'bg-status-card-yellow',
    textClass: 'text-status-orange',
    chipClass: 'border border-status-card-ring-yellow bg-status-card-yellow',
    rowClass: '',
  },
  'En Route Eq': {
    borderClass: 'border-status-card-ring-yellow',
    fillClass: 'bg-status-card-yellow',
    textClass: 'text-status-orange',
    chipClass: 'border border-status-card-ring-yellow bg-status-card-yellow',
    rowClass: '',
  },
  Assisting: {
    borderClass: 'border-status-card-ring-yellow',
    fillClass: 'bg-status-card-yellow',
    textClass: 'text-status-orange',
    chipClass: 'border border-status-card-ring-yellow bg-status-card-yellow',
    rowClass: '',
  },
  'En Route': {
    borderClass: 'border-status-card-ring-red',
    fillClass: 'bg-status-card-red',
    textClass: 'text-status-red',
    chipClass: 'border border-status-card-ring-red bg-status-card-red',
    rowClass: 'bg-status-card-red',
  },
  'On Scene': {
    borderClass: 'border-status-card-ring-red',
    fillClass: 'bg-status-card-red',
    textClass: 'text-status-red',
    chipClass: 'border border-status-card-ring-red bg-status-card-red',
    rowClass: 'bg-status-card-red',
  },
  Transporting: {
    borderClass: 'border-status-card-ring-red',
    fillClass: 'bg-status-card-red',
    textClass: 'text-status-red',
    chipClass: 'border border-status-card-ring-red bg-status-card-red',
    rowClass: 'bg-status-card-red',
  },
};

export function getStatusColor(status?: string | null): DispatchStatusColor {
  if (!status) return DEFAULT_STATUS_COLOR;
  return STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;
}

const CLOSED_CALL_STATUSES = ['Resolved', 'Delivered', 'Delivered Eq', 'Refusal', 'NMM', 'Treat and Release'];
const EQ_RUN_STATUSES = ['Retrieving Eq', 'En Route Eq', 'Assisting'];

export function deriveTeamVisualStatus(status: string, event: Event, team: string): string {
  const onEqRun =
    !!event.calls?.some(c => c.equipmentTeams?.includes(team) && !CLOSED_CALL_STATUSES.includes(c.status)) ||
    EQ_RUN_STATUSES.includes(status);

  if (onEqRun) return 'En Route Eq';
  if (status === 'Returning Eq') return status;

  const activeCare = !!event.calls?.some(c => c.assignedTeam?.includes(team) && !CLOSED_CALL_STATUSES.includes(c.status));

  if (activeCare) return 'En Route';

  return status;
}

/**
 * `deriveTeamVisualStatus` for many units at once: the calls are scanned once
 * up front instead of twice per unit. Use it when looping over every unit.
 */
export function teamVisualStatusResolver(event: Pick<Event, 'calls'>): (status: string, team: string) => string {
  const onEqRun = new Set<string>();
  const onCall = new Set<string>();
  for (const call of event.calls || []) {
    if (CLOSED_CALL_STATUSES.includes(call.status)) continue;
    for (const team of call.equipmentTeams || []) onEqRun.add(team);
    if (Array.isArray(call.assignedTeam)) for (const team of call.assignedTeam) onCall.add(team);
  }
  return (status, team) => {
    if (onEqRun.has(team) || EQ_RUN_STATUSES.includes(status)) return 'En Route Eq';
    if (status === 'Returning Eq') return status;
    if (onCall.has(team)) return 'En Route';
    return status;
  };
}

const ROW_STATUS_PRIORITY = ['Transporting', 'On Scene', 'En Route'];

export function getRowStatusClass(statuses: string[]): string {
  for (const status of ROW_STATUS_PRIORITY) {
    if (statuses.includes(status)) {
      return getStatusColor(status).rowClass;
    }
  }
  return '';
}
