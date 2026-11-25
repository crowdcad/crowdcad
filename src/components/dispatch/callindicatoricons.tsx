// components/dispatch/callindicatoricons.tsx
import { Tooltip } from '@heroui/react';
import { TriangleAlert, Pin } from 'lucide-react';
import type { Call } from '@/app/types';
import { useDispatchExtras } from '@/extensions/dispatch';

/**
 * Priority/pin status icons shown just to the left of a call's three-dot
 * menu, then extension packs' chips (e.g. the call's message thread). Every
 * call view (cards, the calls table, the clinic) shows these. Read-only:
 * toggling either flag happens from the menu itself.
 */
export default function CallIndicatorIcons({ call }: { call: Call }) {
  const { CallChips } = useDispatchExtras();
  if (!call.priority && !call.pin && !CallChips.length) return null;
  return (
    <span className="flex items-center gap-1 shrink-0">
      {CallChips.map((Chip, i) => (
        <Chip key={i} call={call} />
      ))}
      {call.priority && (
        <Tooltip content="Priority Call" placement="top">
          <TriangleAlert className="h-4 w-4 text-status-red" aria-label="Priority call" />
        </Tooltip>
      )}
      {call.pin && (
        <Tooltip content="Pinned Call" placement="top">
          <Pin className="h-4 w-4 text-accent" aria-label="Pinned call" />
        </Tooltip>
      )}
    </span>
  );
}
