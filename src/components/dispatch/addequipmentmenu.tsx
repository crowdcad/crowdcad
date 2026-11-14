'use client';

import type { Call, Event } from '@/app/types';
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

const itemClass = 'text-surface-light hover:bg-surface-liner focus:bg-surface-liner cursor-pointer';
// Units that can take an equipment run without leaving a call, highlighted when not simply Available.
const FREE_STATUSES = ['Available', 'On Break', 'In Clinic', RETURNING_EQ];

/**
 * "Add Equipment" in a call's menu (desktop tracker and mobile card): pick a
 * piece of equipment, then the unit to fetch it. The unit goes to retrieve
 * it first, or straight to the call when it already has it
 * (assignEquipment, src/lib/equipmentCustody.ts).
 */
export default function AddEquipmentSubmenu({
  call,
  event,
  callNumber,
  updateEvent,
}: {
  call: Call;
  event: Event;
  callNumber?: number;
  updateEvent: (updates: Partial<Event>) => Promise<void>;
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
      <DropdownMenuSubTrigger className="hover:bg-surface-liner focus:bg-surface-liner cursor-pointer">
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
          return (
            // Keyed by name: items materialized from the venue catalog get a fresh
            // random id on every render, which would remount the open submenu.
            <DropdownMenuSub key={eq.name}>
              <DropdownMenuSubTrigger
                className={`${itemClass} ${custody.phase === 'in_clinic' ? 'bg-status-card-blue' : ''}`}
                data-testid={`add-equipment-${eq.name}`}
              >
                {eq.name} ({where})
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-surface-deep border-surface-liner">
                {units.length === 0 && (
                  <DropdownMenuItem disabled className="text-surface-light/50">
                    {t('No teams available')}
                  </DropdownMenuItem>
                )}
                {units.map((u) => {
                  const holdsIt = custody.holder.kind === 'team' && custody.holder.name === u.team;
                  return (
                    <DropdownMenuItem
                      key={u.team}
                      className={`${itemClass} ${u.status !== 'Available' ? 'bg-status-card-blue' : ''}`}
                      onClick={() => void assign(eq.name, u.team)}
                    >
                      {u.team}
                      {u.status !== 'Available' && ` (${t(u.status)})`}
                      {holdsIt && ` · ${t('has it')}`}
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
