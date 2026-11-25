'use client';

// Team / supervisor / equipment / vehicle lists for the dispatch page's left panel.
// Rendered by both the desktop sidebar and the mobile bottom-tab layout, which
// previously each carried their own copy of the sort + map + empty-state code.

import React, { useMemo } from 'react';
import type { EquipmentArrival } from '@/lib/equipmentArrivals';
import type { Event, Staff, Supervisor, EquipmentItem } from '@/app/types';
import TeamWidget from '@/components/dispatch/teamwidget';
import EquipmentCard from '@/components/dispatch/equipmentcard';
import VehicleCard from '@/components/dispatch/vehiclecard';
import { eventVehicles, throughVehicle } from '@/lib/vehicles';
import { materializeEventEquipment } from '@/lib/equipmentCustody';
import { sortTeams, type TeamSortMode } from '@/lib/teamSort';
import type { UnitTracking } from '@/lib/unitTracking';

type SharedTeamListProps = {
  event: Event;
  callDisplayNumberMap: Map<string, number>;
  teamTimers: { [team: string]: number };
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  cardViewMode: 'normal' | 'condensed';
  hasVenueMap: boolean;
  knownMapLocations: Set<string>;
  /** Live positions on a TAK event (D66); null otherwise. */
  unitTracking?: UnitTracking | null;
  onRefreshTeamPost: (team: string) => void;
  onNewCall: (team: string) => void;
};

function EmptyListText({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-surface-light/50 py-8">{children}</div>;
}

export type TeamListProps = SharedTeamListProps & {
  sortMode: TeamSortMode;
  onStatusChange: (staff: Staff, newStatus: string, detail?: string) => void;
  onLocationChange: (staff: Staff, newLocation: string) => void;
  onEditTeam: (staff: Staff) => void;
  onDeleteTeam: (team: string) => void;
  onViewOnMap: (team: string) => void;
  /** Edits a team's post for one posting time (shown in the card on TAK events with a schedule). */
  onPostAssignment?: (time: string, post: string, team: string) => void;
};

export function TeamList({
  sortMode, onStatusChange, onLocationChange, onEditTeam, onDeleteTeam, onViewOnMap, onPostAssignment,
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
          onPostAssignment={onPostAssignment}
          {...shared}
        />
      ))}
      {sorted.length === 0 && <EmptyListText>{emptyText}</EmptyListText>}
    </div>
  );
}

export type SupervisorListProps = SharedTeamListProps & {
  onStatusChange: (supervisor: Staff, newStatus: string, detail?: string) => void;
  onLocationChange: (supervisor: Staff, newLocation: string) => void;
  onEditSupervisor: (supervisor: Supervisor) => void;
  onDeleteSupervisor: (team: string) => void;
  onViewOnMap: (team: string) => void;
};

// Supervisors reuse the team card, so each one is adapted to the Staff shape.
function supervisorAsStaff(supervisor: Supervisor): Staff {
  // Every field carries over (including extension packs' fields); `member` becomes `members`.
  const { member, ...rest } = supervisor;
  return { ...rest, members: [member] } as Staff;
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
  onPickedUp: (equipmentName: string) => void;
  onDelete: (equipmentName: string) => void;
  onViewOnMap: (equipmentName: string) => void;
  /** Whether a unit, or an equipment item's own tracker, has a live position (TAK), so it can be found on the map. */
  unitTracked?: (unitName: string) => boolean;
  equipmentTracked?: (equipmentName: string) => boolean;
  /** Pickup/return suggestions from live tracking, shown on the matching cards. */
  arrivals?: EquipmentArrival[];
  onConfirmArrival?: (arrival: EquipmentArrival) => void;
  onDismissArrival?: (arrival: EquipmentArrival) => void;
};

export function EquipmentList({
  event, items, knownMapLocations, unitTracked, equipmentTracked, arrivals, emptyText, ...cardProps
}: EquipmentListProps & { emptyText: React.ReactNode }) {
  const hasEquipment = !!(event.venue?.equipment?.length || event.eventEquipment?.length);
  const vehicles = eventVehicles(event);
  // Available first, anything out on a call at the bottom (stable otherwise).
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.status !== 'Available') - Number(b.status !== 'Available')),
    [items]
  );
  if (!hasEquipment) return <EmptyListText>{emptyText}</EmptyListText>;
  return (
    <div className="dispatch-shell-list">
      {sorted.map(item => {
        // On a vehicle, it is wherever the vehicle is; with a unit, wherever that unit is.
        const location = throughVehicle({ location: item.currentLocation || item.stagingLocation }, vehicles).location;
        const unit = [...(event.staff || []), ...(event.supervisor || [])].find(u => u.team === location);
        const mapLocation = unit ? unit.location : location;
        return (
          <EquipmentCard
            key={item.name}
            equipment={item}
            event={event}
            canLocateOnMap={!!equipmentTracked?.(item.name) || (!!unit && !!unitTracked?.(unit.team)) || (!!mapLocation && knownMapLocations.has(mapLocation))}
            arrival={arrivals?.find(a => a.equipmentName === item.name)}
            {...cardProps}
          />
        );
      })}
    </div>
  );
}

export type VehicleListProps = {
  event: Event;
  onLocationChange: (vehicleId: string, location: string) => void;
  onEquipmentChange: (vehicleId: string, equipmentNames: string[]) => void;
  onDelete: (vehicleId: string) => void;
};

export function VehicleList({ event, emptyText, ...cardProps }: VehicleListProps & { emptyText: React.ReactNode }) {
  const vehicles = eventVehicles(event);
  const equipment = materializeEventEquipment(event);
  if (!vehicles.length) return <EmptyListText>{emptyText}</EmptyListText>;
  return (
    <div className="dispatch-shell-list">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          event={event}
          equipmentOn={equipment.filter((e) => e.defaultLocation === vehicle.name || e.location === vehicle.name).map((e) => e.name)}
          equipmentNames={equipment.map((e) => e.name)}
          {...cardProps}
        />
      ))}
    </div>
  );
}
