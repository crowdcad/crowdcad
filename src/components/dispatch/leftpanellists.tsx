'use client';

// Team / supervisor / equipment lists for the dispatch page's left panel.
// Rendered by both the desktop sidebar and the mobile bottom-tab layout, which
// previously each carried their own copy of the sort + map + empty-state code.

import React, { useMemo } from 'react';
import type { Event, Staff, Supervisor, EquipmentItem } from '@/app/types';
import TeamWidget from '@/components/dispatch/teamwidget';
import EquipmentCard from '@/components/dispatch/equipmentcard';
import { sortTeams, type TeamSortMode } from '@/lib/teamSort';

type SharedTeamListProps = {
  event: Event;
  callDisplayNumberMap: Map<string, number>;
  teamTimers: { [team: string]: number };
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  cardViewMode: 'normal' | 'condensed';
  hasVenueMap: boolean;
  knownMapLocations: Set<string>;
  onRefreshTeamPost: (team: string) => void;
  onNewCall: (team: string) => void;
};

function EmptyListText({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-surface-light/50 py-8">{children}</div>;
}

export type TeamListProps = SharedTeamListProps & {
  sortMode: TeamSortMode;
  onStatusChange: (staff: Staff, newStatus: string, clinicId?: string) => void;
  onLocationChange: (staff: Staff, newLocation: string) => void;
  onEditTeam: (staff: Staff) => void;
  onDeleteTeam: (team: string) => void;
  onViewOnMap: (team: string) => void;
};

export function TeamList({
  sortMode, onStatusChange, onLocationChange, onEditTeam, onDeleteTeam, onViewOnMap,
  emptyText, ...shared
}: TeamListProps & { emptyText: React.ReactNode }) {
  const staff = shared.event.staff;
  const sorted = useMemo(() => sortTeams(staff || [], sortMode), [staff, sortMode]);
  return (
    <div className="dispatch-shell-list">
      {sorted.map(team => (
        <TeamWidget
          key={team.team}
          staff={team}
          onStatusChange={onStatusChange}
          onLocationChange={onLocationChange}
          onEditTeam={onEditTeam}
          onDeleteTeam={onDeleteTeam}
          onViewOnMap={onViewOnMap}
          {...shared}
        />
      ))}
      {sorted.length === 0 && <EmptyListText>{emptyText}</EmptyListText>}
    </div>
  );
}

export type SupervisorListProps = SharedTeamListProps & {
  onStatusChange: (supervisor: Staff, newStatus: string) => void;
  onLocationChange: (supervisor: Staff, newLocation: string) => void;
  onEditSupervisor: (supervisor: Supervisor) => void;
  onDeleteSupervisor: (team: string) => void;
  onViewOnMap: (team: string) => void;
};

// Supervisors reuse the team card, so each one is adapted to the Staff shape.
function supervisorAsStaff(supervisor: Supervisor): Staff {
  return {
    team: supervisor.team,
    location: supervisor.location,
    status: supervisor.status,
    members: [supervisor.member],
    log: supervisor.log,
    originalPost: supervisor.originalPost,
  };
}

export function SupervisorList({
  onStatusChange, onLocationChange, onEditSupervisor, onDeleteSupervisor, onViewOnMap,
  emptyText, ...shared
}: SupervisorListProps & { emptyText: React.ReactNode }) {
  const supervisors = shared.event.supervisor;
  // Copy before sorting — this used to sort event.supervisor in place.
  const sorted = useMemo(() => sortTeams(supervisors || [], 'asc'), [supervisors]);
  return (
    <div className="dispatch-shell-list">
      {sorted.map(supervisor => (
        <TeamWidget
          key={supervisor.team}
          staff={supervisorAsStaff(supervisor)}
          onStatusChange={onStatusChange}
          onLocationChange={onLocationChange}
          onEditTeam={(staff) => {
            const match = supervisors?.find(s => s.team === staff.team);
            if (match) onEditSupervisor(match);
          }}
          onDeleteTeam={onDeleteSupervisor}
          onViewOnMap={onViewOnMap}
          {...shared}
        />
      ))}
      {sorted.length === 0 && <EmptyListText>{emptyText}</EmptyListText>}
    </div>
  );
}

export type EquipmentListProps = {
  event: Event;
  items: EquipmentItem[];
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  hasVenueMap: boolean;
  knownMapLocations: Set<string>;
  onStatusChange: (equipmentName: string, newStatus: string) => void;
  onLocationChange: (equipmentName: string, newLocation: string) => void;
  onMarkReady: (equipmentName: string) => void;
  onDelete: (equipmentName: string) => void;
  onViewOnMap: (equipmentName: string) => void;
};

export function EquipmentList({
  event, items, knownMapLocations, emptyText, ...cardProps
}: EquipmentListProps & { emptyText: React.ReactNode }) {
  const hasEquipment = !!(event.venue?.equipment?.length || event.eventEquipment?.length);
  // Available first, anything out on a call at the bottom (stable otherwise).
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.status !== 'Available') - Number(b.status !== 'Available')),
    [items]
  );
  if (!hasEquipment) return <EmptyListText>{emptyText}</EmptyListText>;
  return (
    <div className="dispatch-shell-list">
      {sorted.map(item => {
        const location = item.currentLocation || item.stagingLocation;
        return (
          <EquipmentCard
            key={item.name}
            equipment={item}
            event={event}
            canLocateOnMap={!!location && knownMapLocations.has(location)}
            {...cardProps}
          />
        );
      })}
    </div>
  );
}
