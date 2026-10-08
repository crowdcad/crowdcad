'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Switch } from '@heroui/react';
import { listAllBridges, listAllowedBridges } from '../data/takStore';
import { TAK_MODULE_MARKER } from '../marker';
import HelpTip from './HelpTip';
import { ACCENT_SWITCH_CLASSNAMES } from '../lib/ui';

/**
 * Venue Configuration's TAK switch (touchpoint l, D61). Turning it on adds
 * the TAK alignment step after Map. It is disabled until the user has a TAK
 * server: one they are allowed to use, or, for an admin, any set up here.
 */
export interface TakVenueSettingProps {
  uid: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function TakVenueSetting({ uid, enabled, onChange }: TakVenueSettingProps) {
  const [hasServer, setHasServer] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    // Admins can read every bridge; anyone else only those they are allowed on (the full list is refused).
    void Promise.all([listAllowedBridges(uid).catch(() => []), listAllBridges().catch(() => [])]).then(([allowed, all]) => {
      if (alive) setHasServer(allowed.length + all.length > 0);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  const unavailable = hasServer === false;
  return (
    <div className="space-y-1" data-tak-module={TAK_MODULE_MARKER}>
      <div className="flex items-center gap-1.5">
        <Switch
          size="sm"
          isSelected={enabled}
          isDisabled={hasServer === null || (unavailable && !enabled)}
          onValueChange={onChange}
          classNames={ACCENT_SWITCH_CLASSNAMES}
        >
          TAK live tracking
        </Switch>
        <HelpTip text="Adds a TAK alignment step after Map, where you match each map to real-world positions so TAK devices appear in the right place." />
      </div>
      {unavailable && (
        <p className="text-xs text-surface-faint">
          Needs a TAK server. Set one up in{' '}
          <Link href="/profile" className="text-accent underline">
            Settings (Admin, TAK)
          </Link>
          , or ask an admin to give you access to one.
        </p>
      )}
    </div>
  );
}
