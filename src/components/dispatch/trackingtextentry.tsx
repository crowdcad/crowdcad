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
      maxRows={maxRows}
      variant={variant ?? 'flat'}
      className={cn('min-w-0', className)}
      classNames={{
        ...classNames,
        input: cn(
          'minimal-scrollbar bg-surface-deep text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0 text-shadow-none [-webkit-text-fill-color:currentColor] !pr-0',
          mode === 'log' ? 'text-sm' : undefined,
          classNames?.input
        ),
        inputWrapper: cn(
          'bg-surface-deep shadow-none border border-surface-liner !py-1 !pr-1 group-data-[hover=true]:bg-surface-deep group-data-[focus=true]:bg-surface-deep group-data-[focus-visible=true]:bg-surface-deep group-data-[pressed=true]:bg-surface-deep group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 focus-within:ring-0',
          classNames?.inputWrapper
        ),
      }}
    />
  );
}
