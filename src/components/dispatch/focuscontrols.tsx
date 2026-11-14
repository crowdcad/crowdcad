'use client';

import React from 'react';
import { Tooltip } from '@heroui/react';
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';

/**
 * Full-screen (focus) controls for one side of the dispatch board (#138): a
 * maximize/restore button and, while focused, "open in a new window" (for a
 * second monitor or a station display). The page owns the state; see
 * src/lib/dispatchFocus.ts.
 */
export default function FocusControls({
  focused,
  onToggle,
  onOpenWindow,
  label,
  size = 'sm',
}: {
  focused: boolean;
  onToggle: () => void;
  /** Shown while focused. */
  onOpenWindow?: () => void;
  /** What is focused, e.g. "Calls", for the button labels. */
  label: string;
  /** 'md' matches the left panel's 40 px action buttons; 'sm' the 32 px tab-bar buttons. */
  size?: 'sm' | 'md';
}) {
  const buttonClass =
    `${size === 'md' ? 'h-10 w-10' : 'h-8 w-8'} shrink-0 flex items-center justify-center rounded-md border border-surface-liner bg-surface-deep text-surface-light hover:bg-surface-liner transition-colors`;
  return (
    <div className={`flex gap-1.5 shrink-0 ${size === 'md' ? 'items-center' : 'items-start'}`}>
      {focused && onOpenWindow && (
        <Tooltip content={`Open ${label} in a new window`} placement="bottom">
          <button type="button" className={buttonClass} onClick={onOpenWindow} aria-label={`Open ${label} in a new window`} data-testid="focus-open-window">
            <ExternalLink className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
      <Tooltip content={focused ? 'Exit full screen (Esc)' : `Full screen: ${label}`} placement="bottom">
        <button
          type="button"
          className={buttonClass}
          onClick={onToggle}
          aria-pressed={focused}
          aria-label={focused ? 'Exit full screen' : `Full screen: ${label}`}
          data-testid="focus-toggle"
        >
          {focused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </Tooltip>
    </div>
  );
}
