'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, Input, Spinner, Switch } from '@heroui/react';
import { dbService } from '@/lib/services';
import type { Venue } from '@/app/types';
import type { ServiceUser } from '@/lib/services';
import { FIELD_CLASSNAMES } from '@/components/ui/fieldClassNames';

export default function AdminVenuesSection({ currentUser }: { currentUser: ServiceUser }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const docs = await dbService.queryCollection<Venue>('venues', [
          { field: 'userId', op: '==', value: currentUser.uid },
        ]);
        setVenues(docs.map((d) => ({ ...(d.data as Venue), id: d.id })));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => (v.name || '').toLowerCase().includes(q));
  }, [venues, search]);

  const toggleOrgVenue = async (venue: Venue) => {
    setUpdatingId(venue.id);
    try {
      await dbService.updateDocument('venues', venue.id, { isOrgVenue: !venue.isOrgVenue });
      setVenues((prev) =>
        prev.map((v) => (v.id === venue.id ? { ...v, isOrgVenue: !v.isOrgVenue } : v)),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
      <CardBody className="p-6">
        <h3 className="text-xl font-semibold mb-4">Organization Venues</h3>
        <p className="text-sm text-surface-light/70 mb-4">
          Venues you own that are toggled on appear in every user&apos;s venue list, instead of
          being shared with people one at a time.
        </p>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your venues"
          classNames={FIELD_CLASSNAMES}
          className="mb-4"
        />

        {loading ? (
          <Spinner size="sm" classNames={{ circle1: 'border-b-accent', circle2: 'border-b-accent' }} />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {filtered.map((venue) => (
              <div
                key={venue.id}
                className="flex items-center justify-between gap-3 rounded-large bg-surface-deeper/90 px-4 py-3"
              >
                <p className="text-sm text-surface-light truncate">{venue.name}</p>
                <Switch
                  isSelected={Boolean(venue.isOrgVenue)}
                  onValueChange={() => toggleOrgVenue(venue)}
                  isDisabled={updatingId === venue.id}
                  aria-label={`Organization venue toggle for ${venue.name}`}
                  classNames={{ wrapper: 'group-data-[selected=true]:bg-accent' }}
                />
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-surface-light/50">
                {venues.length === 0 ? "You haven't created any venues yet." : 'No venues found.'}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
