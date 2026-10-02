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

export const TEAM_CARD_ROW_HOVER_CLASS = 'hover:bg-surface-deep';

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

export function deriveTeamVisualStatus(status: string, event: Event, team: string): string {
  const onEqRun =
    !!event.calls?.some(
      c => c.equipmentTeams?.includes(team) && !['Resolved', 'Delivered', 'Delivered Eq', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
    ) || ['En Route Eq', 'Assisting'].includes(status);

  if (onEqRun) return 'En Route Eq';

  const activeCare = !!event.calls?.some(
    c => c.assignedTeam?.includes(team) && !['Resolved', 'Delivered', 'Delivered Eq', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
  );

  if (activeCare) return 'En Route';

  return status;
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
