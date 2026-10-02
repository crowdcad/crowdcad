'use client';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ccad-surge-flashing-disabled';
// Same-tab change notification — the native `storage` event only fires in
// *other* tabs, so a toggle in Preferences wouldn't otherwise reach a
// dispatch board already mounted in this one.
const CHANGE_EVENT = 'ccad-surge-flashing-change';

function readDisabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether surge indicators (the active Surge button and the Pending call
 * chip once it trips the unassigned-call surge alarm) blink between grey and
 * alarm orange, or hold a steady orange instead. A per-device preference set
 * from Profile → Preferences; flashing is on by default.
 */
export function useSurgeFlashing() {
  const [flashingDisabled, setFlashingDisabledState] = useState(false);

  useEffect(() => {
    const sync = () => setFlashingDisabledState(readDisabled());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const setFlashingDisabled = useCallback((value: boolean) => {
    setFlashingDisabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // localStorage unavailable — in-memory state still updates
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { flashingDisabled, setFlashingDisabled };
}

/** Classes for a surge indicator in its alarm state — blinking, or a steady orange when flashing is disabled. */
export function surgeAlarmClass(flashingDisabled: boolean): string {
  return flashingDisabled
    ? 'border-status-alarm bg-status-alarm/[0.45]'
    : 'border-surface-liner bg-surface-liner/30 animate-pending-alarm';
}
