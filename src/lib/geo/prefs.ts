import { useEffect, useState } from 'react';

/**
 * Per-viewer display preferences (basemap choice, image opacity), kept in
 * this browser only. They change what one person sees, never event data, so
 * losing them (private window, cleared storage) only resets the defaults.
 */

const PREFIX = 'crowdcad.tak.';
const listeners = new Map<string, Set<(v: unknown) => void>>();
const memory = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {
    // Storage unavailable: use the default.
  }
  return fallback;
}

export function setPref<T>(key: string, value: T): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Kept in memory for this page only.
  }
  for (const l of listeners.get(key) ?? []) l(value);
}

/** A preference shared by every component that uses the same key. */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    setValue(read(key, fallback));
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set);
    const l = (v: unknown) => setValue(v as T);
    set.add(l);
    return () => {
      set.delete(l);
    };
    // The fallback is a constant at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, (v: T) => setPref(key, v)];
}

/** Preference keys. */
export const PREF = {
  /** Basemap in "Align map" and the history view. */
  alignBasemap: 'alignBasemap',
  /** Basemap under the dispatch map of an aligned event map ("auto" by default; "none" turns it off). */
  underlayBasemap: 'underlayBasemap',
  /** Opacity of the event map image over a basemap, 0.2 to 1. */
  imageOpacity: 'imageOpacity',
} as const;
