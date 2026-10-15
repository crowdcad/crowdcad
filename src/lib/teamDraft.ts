import type { Staff, Supervisor } from '@/app/types';
import type { TeamDraft } from '@/components/modals/event/addteammodal';
import { newTeamId } from '@/lib/teamId';

/**
 * Converting between AddTeamModal's drafts and stored teams, shared by cloud
 * and Lite event creation. Members are stored as "Name [CERT]" with " (Lead)"
 * appended for the lead.
 */

export function teamMemberStrings(team: TeamDraft): string[] {
  return team.members.map((m) => `${m.name} [${m.cert}]${m.lead ? ' (Lead)' : ''}`);
}

/** A new team, off post and on break. */
export function newTeam(team: TeamDraft): Staff {
  return { id: newTeamId(), team: team.name, location: 'No Post', status: 'On Break', members: teamMemberStrings(team) };
}

/** An existing team as a draft for AddTeamModal (the reverse of teamMemberStrings). */
export function teamDraftFromStaff(team: Staff): TeamDraft {
  return {
    name: team.team,
    members: team.members.map((member) => {
      const match = member.match(/^(.+?)\s*\[([^\]]+)\]\s*(\(Lead\))?$/);
      return match ? { name: match[1]!, cert: match[2]!, lead: Boolean(match[3]) } : { name: member, cert: '', lead: false };
    }),
  };
}

/** A new supervisor unit, roaming and on break; the member defaults to the unit's own name. */
export function newSupervisor(name: string, memberName: string, cert: string): Supervisor {
  return {
    id: newTeamId(),
    team: name.trim(),
    location: 'Roaming',
    status: 'On Break',
    member: `${memberName.trim() || name.trim()} [${cert}]`,
  };
}
