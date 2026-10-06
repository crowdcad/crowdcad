import type { TakDeviceLink, TakDeviceMapping, TakLivePosition } from '../data/takStore';

/** A team as TAK sees it: an opaque id and the name dispatchers use. */
export interface TakTeam {
  id: string;
  name: string;
  kind: 'team' | 'supervisor';
}

/** Callsign/team-name matching ignores case and whitespace ("Medic 1" = "medic1"). */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

export interface ProposedLink {
  deviceUid: string;
  teamId: string;
  method: 'auto';
  reason: 'callsign' | 'remembered';
}

/**
 * Links to make automatically for devices that have no link yet: first a
 * remembered mapping (device -> team name) for this bridge, then a callsign
 * that matches exactly one team name. Ambiguous matches are left for a
 * dispatcher.
 */
export function proposeAutoLinks(
  live: TakLivePosition[],
  links: TakDeviceLink[],
  teams: TakTeam[],
  mappings: TakDeviceMapping[],
): ProposedLink[] {
  const linked = new Set(links.map((l) => l.deviceUid));
  const byName = new Map<string, TakTeam[]>();
  for (const t of teams) {
    const key = normalizeName(t.name);
    byName.set(key, [...(byName.get(key) ?? []), t]);
  }
  const unique = (name: string) => {
    const found = byName.get(normalizeName(name));
    return found && found.length === 1 ? found[0] : undefined;
  };
  const remembered = new Map(mappings.map((m) => [m.deviceUid, m.teamName]));

  const out: ProposedLink[] = [];
  for (const p of live) {
    if (linked.has(p.deviceUid)) continue;
    const mapped = remembered.get(p.deviceUid);
    const fromMapping = mapped ? unique(mapped) : undefined;
    if (fromMapping) {
      out.push({ deviceUid: p.deviceUid, teamId: fromMapping.id, method: 'auto', reason: 'remembered' });
      continue;
    }
    const fromCallsign = p.callsign ? unique(p.callsign) : undefined;
    if (fromCallsign) out.push({ deviceUid: p.deviceUid, teamId: fromCallsign.id, method: 'auto', reason: 'callsign' });
  }
  return out;
}

/** Live devices with no link, newest first. */
export function unassignedDevices(live: TakLivePosition[], links: TakDeviceLink[]): TakLivePosition[] {
  const linked = new Set(links.map((l) => l.deviceUid));
  return live.filter((p) => !linked.has(p.deviceUid)).sort((a, b) => b.receivedAt - a.receivedAt);
}

export interface TeamPosition {
  team: TakTeam;
  position: TakLivePosition;
  deviceCount: number;
}

/** Each team's position: the most recent fix among its linked devices. */
export function teamPositions(live: TakLivePosition[], links: TakDeviceLink[], teams: TakTeam[]): TeamPosition[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const liveByDevice = new Map(live.map((p) => [p.deviceUid, p]));
  const best = new Map<string, TeamPosition>();
  for (const link of links) {
    const team = teamById.get(link.teamId);
    const position = liveByDevice.get(link.deviceUid);
    if (!team || !position) continue;
    const current = best.get(team.id);
    if (!current) best.set(team.id, { team, position, deviceCount: 1 });
    else {
      current.deviceCount++;
      if (position.receivedAt > current.position.receivedAt) current.position = position;
    }
  }
  return [...best.values()];
}

/** A fix is stale when the device hasn't reported for this long. */
export const STALE_AFTER_MS = 2 * 60_000;
export const isStale = (p: TakLivePosition, now: number) => now - p.receivedAt > STALE_AFTER_MS;
