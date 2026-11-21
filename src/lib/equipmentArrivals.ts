import type { Event } from '@/app/types';
import { custodyOf, stagingLocation } from '@/lib/equipmentCustody';

/**
 * Equipment pickup and return suggestions from live tracking. A unit
 * steadily at a post (UnitTracking.atPost) that matches where its equipment
 * run says it is heading is offered to the dispatcher as a one-click
 * confirmation. Nothing changes until they confirm: a unit passing by the
 * staging post shouldn't move equipment on its own.
 *
 * - Sent to fetch equipment from a post, and at that post: picked up?
 * - Bringing equipment back, and at its staging location: returned?
 */
export interface EquipmentArrival {
  kind: 'picked_up' | 'returned';
  equipmentName: string;
  unit: string;
  post: string;
}

/** "Team 3 is at Staging. Picked up Wheelchair 1?" */
export function arrivalQuestion(a: EquipmentArrival): string {
  return `${a.unit} is at ${a.post}. ${a.kind === 'picked_up' ? 'Picked up' : 'Returned'} ${a.equipmentName}?`;
}

/** Stable identity of a suggestion, for dismissing it and for showing it only once. */
export const arrivalKey = (a: EquipmentArrival) => `${a.kind}:${a.equipmentName}:${a.unit}:${a.post}`;

export function equipmentArrivals(
  event: Pick<Event, 'eventEquipment' | 'venue' | 'staff' | 'supervisor' | 'clinics'>,
  atPost: Record<string, string> | undefined
): EquipmentArrival[] {
  if (!atPost) return [];
  const out: EquipmentArrival[] = [];
  for (const eq of event.eventEquipment || []) {
    const { phase, holder } = custodyOf(eq, event);
    if (phase === 'retrieving' && holder.kind === 'post' && eq.assignedTeam && atPost[eq.assignedTeam] === holder.name) {
      out.push({ kind: 'picked_up', equipmentName: eq.name, unit: eq.assignedTeam, post: holder.name });
    } else if (phase === 'returning' && holder.kind === 'team') {
      const staging = stagingLocation(eq, event);
      if (atPost[holder.name] === staging) out.push({ kind: 'returned', equipmentName: eq.name, unit: holder.name, post: staging });
    }
  }
  return out;
}
