'use client';
import { useEffect, useState } from 'react';
import { useAdmin } from './useAdmin';
import { listRoster, type RosterPerson } from '@/lib/roster';

/** The staff roster for name suggestions, for admins (everyone else gets an empty list: the roster is admin-only). */
export function useRoster(enabled = true): { roster: RosterPerson[]; isAdmin: boolean } {
  const { isAdmin } = useAdmin();
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  useEffect(() => {
    if (!enabled || !isAdmin) return;
    let cancelled = false;
    listRoster()
      .then((people) => {
        if (!cancelled) setRoster(people);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, isAdmin]);
  return { roster: enabled && isAdmin ? roster : [], isAdmin };
}
