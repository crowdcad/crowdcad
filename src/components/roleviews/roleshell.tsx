'use client';

import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { Layer, Staff, Supervisor } from '@/app/types';
import type { MciUnit } from '@/lib/mciDoc';
import type { UnitTracking } from '@/lib/unitTracking';
import { authService } from '@/lib/services';
import VenueMapTab from '@/components/dispatch/venuemaptab';
import { MapBackFab, MapFab } from './roleparts';

const TakRolePositions =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakRolePositions }))) : null;

/**
 * The frame of every MCI role view (#144): a header with just the title and
 * Sign out, the content, and the round Map button, which opens the event map
 * with zones, tarps, posts and teams, and a clear "You" when the unit has a
 * tracker (#154). On the map, a round Back button in the same place returns
 * to the view.
 */
export default function RoleShell({
  title,
  eventId,
  unitName,
  units,
  layers,
  children,
  mapBottomClass,
  headerExtra,
}: {
  title: string;
  eventId: string;
  unitName?: string;
  units: MciUnit[];
  layers: Layer[];
  children: React.ReactNode;
  /** Where the Map button sits above the view's own bottom bar. */
  mapBottomClass?: string;
  headerExtra?: React.ReactNode;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [tracking, setTracking] = useState<UnitTracking>({ positions: {}, alignments: {} });
  const [focusId, setFocusId] = useState(0);
  const onTracking = useCallback((t: UnitTracking) => setTracking(t), []);

  // The map draws units from these; a role view knows units only from the MCI unit summary.
  const staff = useMemo<Staff[]>(() => units.filter((u) => u.kind === 'team').map((u) => ({ ...(u.id ? { id: u.id } : {}), team: u.name, status: u.status, location: '', members: [] })), [units]);
  const supervisor = useMemo<Supervisor[]>(() => units.filter((u) => u.kind === 'supervisor').map((u) => ({ ...(u.id ? { id: u.id } : {}), team: u.name, status: u.status, location: '', member: '' })), [units]);
  const me = unitName ? tracking.positions[unitName] : undefined;
  const youTracked = !!me;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col bg-surface-deepest text-surface-light">
      <header className="flex items-center justify-between border-b border-surface-liner bg-surface-deep px-4 py-3">
        <h1 className="m-0 text-2xl font-bold" data-testid="role-title">
          {title}
        </h1>
        <div className="flex items-center gap-4">
          {headerExtra}
          <button type="button" className="min-h-11 text-base text-accent" onClick={() => void authService.signOut()} data-testid="role-signout">
            Sign out
          </button>
        </div>
      </header>
      {children}
      {layers.length > 0 && (
        <MapFab
          bottomClass={mapBottomClass}
          onPress={() => {
            setMapOpen(true);
            setFocusId(Date.now());
          }}
        />
      )}
      {TakRolePositions && layers.length > 0 && (
        <Suspense fallback={null}>
          <TakRolePositions eventId={eventId} units={units} layers={layers} onTracking={onTracking} />
        </Suspense>
      )}
      {mapOpen && (
        // Below the site navbar (sticky, z-300), which would otherwise cover the top of the map.
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col bg-surface-deepest" data-testid="role-map">
          {youTracked && (
            <div className="flex items-center gap-2.5 border-b border-accent/40 bg-accent/10 px-4 py-2.5 text-base" data-testid="role-map-you">
              <span className="h-3.5 w-3.5 rounded-circle border-2 border-white bg-accent" aria-hidden />
              You ({unitName}) are on the map{me?.stale ? ', last seen a while ago' : ''}, from your team&apos;s tracker.
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <VenueMapTab
              layers={layers}
              staff={staff}
              supervisor={supervisor}
              equipment={[]}
              teamTimers={{}}
              calls={[]}
              clinics={[]}
              showPosts={false}
              focusTeamRequest={youTracked && unitName && staff.some((s) => s.team === unitName) ? { teamName: unitName, requestId: focusId } : null}
              focusSupervisorRequest={youTracked && unitName && supervisor.some((s) => s.team === unitName) ? { supervisorName: unitName, requestId: focusId } : null}
              overlay={{ unitTracking: tracking }}
            />
          </div>
          <MapBackFab bottomClass={mapBottomClass} onPress={() => setMapOpen(false)} />
        </div>
      )}
    </div>
  );
}
