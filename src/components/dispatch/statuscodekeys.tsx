'use client';

import { useEffect, useRef } from 'react';
import { statusForTyped } from '@/lib/statusCodes';

/** Letters typed further apart than this start a new code. */
const GAP_MS = 1200;

/**
 * While a status menu is open, typing a status code (UTL, NMM, AMA:
 * src/lib/statusCodes.ts) picks that status. Mount it inside the menu (its
 * `topContent`), so it listens only while the menu is open. Renders nothing.
 */
export default function StatusCodeKeys({ options, onPick }: { options: string[]; onPick: (status: string) => void }) {
  const typed = useRef({ text: '', at: 0 });
  const latest = useRef({ options, onPick });
  latest.current = { options, onPick };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[a-z]$/i.test(e.key)) return;
      const now = Date.now();
      const text = (now - typed.current.at > GAP_MS ? '' : typed.current.text) + e.key;
      typed.current = { text: text.slice(-3), at: now };
      const status = statusForTyped(text, latest.current.options);
      if (!status) return;
      e.preventDefault();
      e.stopPropagation();
      typed.current = { text: '', at: 0 };
      latest.current.onPick(status);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return null;
}
