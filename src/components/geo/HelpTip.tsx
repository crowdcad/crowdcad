'use client';

import React from 'react';
import { Tooltip } from '@heroui/react';
import { CircleHelp } from 'lucide-react';

/** A hoverable question mark beside a title, as in core's FieldLabel; holds what used to be a subtitle. */
export default function HelpTip({ text, label = 'More information' }: { text: React.ReactNode; label?: string }) {
  return (
    <Tooltip content={<div className="max-w-xs py-1 text-xs">{text}</div>} placement="top">
      <span tabIndex={0} role="img" aria-label={label} className="inline-flex cursor-help align-middle">
        <CircleHelp className="h-3.5 w-3.5 text-surface-faint" />
      </span>
    </Tooltip>
  );
}
