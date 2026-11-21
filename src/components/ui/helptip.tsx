'use client';

import React, { useState } from 'react';
import { Tooltip } from '@heroui/react';
import { CircleHelp } from 'lucide-react';

/**
 * A small circled question mark that explains something on hover or tap, so
 * screens stay short: use it instead of a sentence of help text under a heading.
 * Taps toggle it, since a touch screen has no hover. Never put it inside a
 * <label> (a checkbox): the tap would also toggle the checkbox.
 */
export default function HelpTip({ text, label = 'More info', className = '', testId }: { text: React.ReactNode; label?: string; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      content={<span className="block max-w-64 py-0.5 text-sm normal-case tracking-normal">{text}</span>}
      isOpen={open}
      onOpenChange={setOpen}
      placement="top"
      delay={150}
      closeDelay={0}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-circle align-middle text-surface-faint hover:text-surface-light ${className}`}
        data-testid={testId}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}
