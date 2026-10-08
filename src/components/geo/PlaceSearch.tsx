'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@heroui/react';
import { searchPlaces, type PlaceResult } from '@/lib/geo/geocode';
import type { LatLon } from '@/lib/geo/types';

/**
 * Place search for the live map (D55): a place name, address or typed
 * coordinates, searched on Enter. One result moves the map straight there;
 * several are listed to pick from.
 */
export default function PlaceSearch({
  near,
  onPick,
  className,
}: {
  /** Results near this position rank first (usually the map's center). */
  near?: () => LatLon | undefined;
  onPick: (result: PlaceResult) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The results list closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!results) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setResults(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setResults(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [results]);

  const pick = (r: PlaceResult) => {
    setResults(null);
    onPick(r);
  };

  const run = async () => {
    setError(null);
    setSearching(true);
    try {
      const found = await searchPlaces(query, near?.());
      if (found.length === 1) pick(found[0]!);
      else setResults(found);
      if (found.length === 0) setError('No places found. Try a different name or an address.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Place search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-[240px] ${className ?? ''}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input
          size="sm"
          label="Find a place or coordinates (press Enter)"
          placeholder="Venue name, address, or 37.7694, -122.4862"
          value={query}
          onValueChange={setQuery}
          isInvalid={Boolean(error)}
          errorMessage={error ?? undefined}
          description={searching ? 'Searching…' : undefined}
        />
      </form>
      {results && results.length > 1 && (
        // A dropdown over what's below, rather than pushing it down.
        <ul className="minimal-scrollbar absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-surface-liner bg-surface-deep text-sm shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-surface-liner/30" onClick={() => pick(r)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
