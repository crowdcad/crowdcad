'use client';

import React from 'react';
import { Textarea } from '@heroui/react';
import { cn } from '@/lib/utils';

// 'key' is omitted: it's never a real prop, and when root type-checks this file
// with core's own node_modules present, the two @types/react copies disagree on it.
type TrackingTextEntryProps = Omit<React.ComponentProps<typeof Textarea>, 'key'> & {
  mode: 'note' | 'log';
  maxRows: number;
};

// The box is drawn by its border only and shows whatever it sits on. A solid
// fill here used to show as a different shade while an opening card was still
// fading its own background in, then matched once the fade finished (the
// "flicker" on opening a call). Every place this is used sits on surface-deep,
// so at rest it looks the same.
// The <textarea> keeps HeroUI's bg-transparent too: HeroUI gives it
// bg-clip-text, so a background on it is painted in the shape of the glyphs
// (the old "ghost text"). The overrides use HeroUI's own flat-variant selectors
// so tailwind-merge replaces them instead of stacking; the focus ring is
// removed globally ([data-slot="input-wrapper"] in globals.css), and
// disableAnimation drops the wrapper's background transition.
export default function TrackingTextEntry({
  mode,
  maxRows,
  className,
  classNames,
  variant,
  ...props
}: TrackingTextEntryProps) {
  return (
    <Textarea
      {...props}
      disableAnimation
      maxRows={maxRows}
      variant={variant ?? 'flat'}
      className={cn('min-w-0', className)}
      classNames={{
        ...classNames,
        input: cn(
          'minimal-scrollbar text-surface-light group-data-[has-value=true]:text-surface-light !pr-0',
          mode === 'log' ? 'text-sm' : undefined,
          classNames?.input
        ),
        inputWrapper: cn(
          'bg-transparent data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent shadow-none border border-surface-liner !py-1 !pr-1',
          classNames?.inputWrapper
        ),
      }}
    />
  );
}
