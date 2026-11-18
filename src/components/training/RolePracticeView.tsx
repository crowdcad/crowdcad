'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Event } from '@/app/types';
import { normalizeLiteDraftToEvent, toLiteDraftFromEvent } from '@/lib/liteEventAdapters';
import { mciEquipmentFor, mciUnitsFor } from '@/lib/mciDoc';
import { applyRoleAction, type RoleAction } from '@/lib/mciRoleActions';
import { effectiveRole, EVENT_ROLE_INFO } from '@/lib/roleAccounts';
import { getEventVenueLayers } from '@/lib/zones';
import RoleShell from '@/components/roleviews/roleshell';
import ResponderView, { TreatmentLeadView } from '@/components/roleviews/responderview';
import TransportView from '@/components/roleviews/transportview';
import LogisticsView from '@/components/roleviews/logisticsview';
import CommandView from '@/components/roleviews/commandview';
import { RolePracticeProvider, type RolePractice } from '@/components/roleviews/roleparts';
import type { MemoryLiteStore } from '@/training/memoryStore';
import type { RoleSurface } from '@/training/types';

/**
 * A role login's view (src/app/role/page.tsx) on a training module's practice event. It shows what a role
 * login would read (the MCI, the unit summary, equipment, the map) derived from the event, and applies the
 * view's actions in the browser with applyRoleAction, the same helper /api/mci-role runs on the server.
 * Nothing leaves the tab.
 */
export default function RolePracticeView({ store, eventId, surface }: { store: MemoryLiteStore; eventId: string; surface: RoleSurface }) {
  const read = useCallback((): Event | null => {
    const draft = store.peek(eventId);
    return draft ? normalizeLiteDraftToEvent(draft) : null;
  }, [store, eventId]);
  const [event, setEvent] = useState<Event | null>(read);
  useEffect(() => {
    setEvent(read());
    return store.listen(() => setEvent(read()));
  }, [store, read]);

  const practice = useMemo<RolePractice>(
    () => ({
      async send(action: RoleAction) {
        const draft = store.peek(eventId);
        if (!draft) throw new Error('The practice event is gone. Restart the section.');
        const current = normalizeLiteDraftToEvent(draft);
        const unit = [...(current.staff || []), ...(current.supervisor || [])].find((u) => u.team === surface.unit);
        const out = applyRoleAction(current, action, { uid: 'practice', role: surface.role, unitName: surface.unit, unitId: unit?.id }, Date.now());
        if (out.error) throw new Error(out.error);
        store.put(toLiteDraftFromEvent({ ...current, ...out.patch }, draft));
      },
    }),
    [store, eventId, surface]
  );

  const units = useMemo(() => (event ? mciUnitsFor(event) : []), [event]);
  const equipment = useMemo(() => (event ? mciEquipmentFor(event) : []), [event]);
  const layers = useMemo(() => (event ? getEventVenueLayers(event) : []), [event]);
  const mci = event?.mci;
  if (!event || !mci?.active) {
    return <div className="flex h-full items-center justify-center p-6 text-surface-faint">Waiting for the MCI to start.</div>;
  }

  const role = effectiveRole(surface.role);
  const unit = surface.unit;
  const title = role === 'responder' ? unit : EVENT_ROLE_INFO[role].label;
  return (
    <RolePracticeProvider value={practice}>
      <RoleShell title={title} eventId={eventId} unitName={unit} units={units} layers={layers} mapBottomClass={role === 'responder' || role === 'treatment_lead' ? 'bottom-24' : 'bottom-5'}>
        <div className="flex flex-1 flex-col" data-testid={`role-view-${role}`}>
          {role === 'responder' && <ResponderView mci={mci} unit={unit} units={units} />}
          {role === 'treatment_lead' && <TreatmentLeadView mci={mci} unit={unit} units={units} />}
          {role === 'transport' && <TransportView mci={mci} />}
          {role === 'logistics' && <LogisticsView mci={mci} units={units} equipment={equipment} eventId={eventId} eventName={event.name} />}
          {role === 'incident_command' && <CommandView mci={mci} units={units} />}
        </div>
      </RoleShell>
    </RolePracticeProvider>
  );
}
