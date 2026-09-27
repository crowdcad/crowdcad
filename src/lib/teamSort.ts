import type { Staff } from '@/app/types';

export type TeamSortMode = 'availability' | 'asc' | 'desc';

const byTeamName = (a: { team: string }, b: { team: string }) =>
  a.team.localeCompare(b.team, undefined, { numeric: true });

// Lower ranks sort first in "availability" mode.
function availabilityRank(status: string): number {
  if (status === 'Available') return 0;
  if (['In Clinic', 'On Break'].includes(status)) return 1;
  if (['En Route', 'On Scene', 'Transporting'].includes(status)) return 2;
  return 3;
}

/** New sorted array (never mutates `teams`). Names compare numerically, so "Team 2" < "Team 10". */
export function sortTeams<T extends Pick<Staff, 'team' | 'status'>>(teams: readonly T[], mode: TeamSortMode): T[] {
  const sorted = [...teams];
  if (mode === 'availability') {
    return sorted.sort((a, b) => availabilityRank(a.status) - availabilityRank(b.status) || byTeamName(a, b));
  }
  if (mode === 'desc') return sorted.sort((a, b) => byTeamName(b, a));
  return sorted.sort(byTeamName);
}
