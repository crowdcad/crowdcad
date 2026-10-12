'use client';

import { useState } from 'react';
import { Button } from '@heroui/react';
import type { Event, EquipmentCustodyEntry } from '@/app/types';
import { custodyRunStats, describeCustody } from '@/lib/equipmentCustody';
import { GRID_CELL, GRID_WRAPPER } from './summaryGrid';

const BY_LABEL: Record<EquipmentCustodyEntry['by'], string> = {
  status: '',
  dispatcher: 'set by dispatcher',
  tracking: 'confirmed from tracking',
};

const hhmm = (t: number) => {
  const d = new Date(t);
  return d.getHours().toString().padStart(2, '0') + d.getMinutes().toString().padStart(2, '0');
};

/**
 * Each piece of equipment's runs over the event, from its custody log
 * (src/lib/equipmentCustody.ts): how many times it went out, how long it was
 * away, and every change of hands. Hidden when no equipment was ever moved.
 */
export default function EquipmentTimeline({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);
  const items = (event.eventEquipment || []).filter((eq) => (eq.custodyLog || []).length > 0);
  if (items.length === 0) return null;
  const until = event.endedAt ?? Date.now();

  return (
    // A standalone box: the wrapper adds the top/left borders a grid cell leaves to its neighbours.
    <div className={`${GRID_WRAPPER} ${GRID_CELL}`} data-testid="equipment-timeline">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <span className="font-semibold">Equipment Runs</span>
          <div className="text-sm text-surface-faint">
            {items.length} item{items.length === 1 ? '' : 's'} moved
          </div>
        </div>
        <Button size="sm" radius="full" variant="flat" onPress={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {items.map((eq) => {
            const { runs, awayMs } = custodyRunStats(eq.custodyLog, until);
            return (
              <div key={eq.id} className="bg-surface-deepest border border-surface-liner/70 p-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-semibold">{eq.name}</span>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-surface-faint">Runs: </span>
                      <span className="font-semibold">{runs}</span>
                    </div>
                    <div>
                      <span className="text-surface-faint">Time out: </span>
                      <span className="font-semibold">{Math.round(awayMs / 60000)} min</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-sm space-y-1">
                  {(eq.custodyLog || []).map((entry, idx) => (
                    <div key={idx}>
                      <span className="font-mono text-surface-faint">{hhmm(entry.t)}</span>{' '}
                      {describeCustody(entry, entry.team)}
                      {BY_LABEL[entry.by] && <span className="text-surface-faint"> ({BY_LABEL[entry.by]})</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
