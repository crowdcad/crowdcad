'use client';

import type { Call, Event, Layer } from '@/app/types';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useDispatchTerms } from '@/lib/dispatchVocabulary/context';
import { RESOLVED_CALL_STATUSES } from '@/lib/clinics';
import { withPendingSuffix } from '@/lib/callTiming';
import { assignEquipment, custodyOf, isDispatchable, materializeEventEquipment, RETURNING_EQ } from '@/lib/equipmentCustody';
import { distanceM, formatMeters } from '@/lib/geo/distance';
import type { UnitTracking } from '@/lib/unitTracking';
import { byDistance, callPoint, equipmentPoint, unitPoint } from '@/lib/unitDistance';

const itemClass = 'text-surface-light hover:bg-surface-liner focus:bg-surface-liner cursor-pointer';
// Units that can take an equipment run without leaving a call, highlighted when not simply Available.
const FREE_STATUSES = ['Available', 'On Break', 'In Clinic', RETURNING_EQ];

/**
 * "Add Equipment" in a call's menu (desktop tracker and mobile card): pick a
 * piece of equipment, then the unit to fetch it. The unit goes to retrieve
 * it first, or straight to the call when it already has it
 * (assignEquipment, src/lib/equipmentCustody.ts). Each piece shows how far it
 * is from the call, and its units are listed nearest to it first (when the
 * venue's locations have coordinates).
 */
export default function AddEquipmentSubmenu({
  call,
  event,
  callNumber,
  updateEvent,
  layers = [],
  tracking,
}: {
  call: Call;
  event: Event;
  callNumber?: number;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
  layers?: Layer[];
  tracking?: UnitTracking | null;
}) {
  const { t } = useDispatchTerms();

  const equipment = materializeEventEquipment(event).filter(
    (eq) => isDispatchable(eq, event) && !(call.equipment || []).includes(eq.name)
  );

  const onActiveCall = (unit: string) =>
    (event.calls || []).some((c) => c.assignedTeam?.includes(unit) && !RESOLVED_CALL_STATUSES.includes(c.status));
  const units = [...(event.staff || []), ...(event.supervisor || [])].filter(
    (u) => FREE_STATUSES.includes(u.status) && !call.assignedTeam?.includes(u.team) && !onActiveCall(u.team)
  );

  const allUnits = [...(event.staff || []), ...(event.supervisor || [])];
  const target = callPoint(call, layers);
  const meters = (a: { lat: number; lon: number } | null, b: { lat: number; lon: number } | null) => (a && b ? distanceM(a, b) : undefined);

  const assign = async (equipmentName: string, unit: string) => {
    const now = new Date();
    const out = assignEquipment(event, {
      callId: call.id,
      equipmentName,
      unit,
      t: now.getTime(),
      callNumber,
      formatCallLog: (message, c) => withPendingSuffix(message, c, now),
    });
    if (out) await updateEvent(out);
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer" data-testid="call-add-equipment">
        {t('Add Equipment')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
        {equipment.length === 0 && (
          <DropdownMenuItem disabled className="text-surface-light/50">
            {t('No equipment available')}
          </DropdownMenuItem>
        )}
        {equipment.map((eq) => {
          const custody = custodyOf(eq, event);
          const where =
            custody.phase === 'returning' ? `${t(RETURNING_EQ)}: ${custody.holder.name}` : t(custody.holder.name || 'Unknown');
          const eqAt = equipmentPoint(custody.holder, allUnits, layers, tracking);
          const toCall = meters(eqAt, target);
          const nearest = units.map((u) => ({ u, distance: meters(eqAt, unitPoint(u, layers, tracking).at) })).sort(byDistance);
          return (
            // Keyed by name: items materialized from the venue catalog get a fresh
            // random id on every render, which would remount the open submenu.
            <DropdownMenuSub key={eq.name}>
              <DropdownMenuSubTrigger
                className={`${itemClass} ${custody.phase === 'in_clinic' ? 'bg-status-card-blue' : ''}`}
                data-testid={`add-equipment-${eq.name}`}
              >
                <span className="flex w-full items-center gap-2">
                  <span>
                    {eq.name} ({where})
                  </span>
                  {toCall !== undefined && (
                    <span className="ml-auto pl-2 font-mono text-xs tabular-nums text-surface-faint" data-testid={`equipment-distance-${eq.name}`}>
                      {formatMeters(toCall)}
                    </span>
                  )}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                {units.length === 0 && (
                  <DropdownMenuItem disabled className="text-surface-light/50">
                    {t('No teams available')}
                  </DropdownMenuItem>
                )}
                {nearest.map(({ u, distance }) => {
                  const holdsIt = custody.holder.kind === 'team' && custody.holder.name === u.team;
                  return (
                    <DropdownMenuItem
                      key={u.team}
                      className={`${itemClass} ${u.status !== 'Available' ? 'bg-status-card-blue' : ''}`}
                      data-testid={`add-equipment-unit-${u.team}`}
                      onClick={() => void assign(eq.name, u.team)}
                    >
                      {u.team}
                      {u.status !== 'Available' && ` (${t(u.status)})`}
                      {holdsIt && ` · ${t('has it')}`}
                      {distance !== undefined && (
                        <span className="ml-auto pl-3 font-mono text-xs tabular-nums text-surface-faint" data-testid={`equipment-unit-distance-${u.team}`}>
                          {formatMeters(distance)}
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
