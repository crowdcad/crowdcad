'use client';

import React from 'react';
import { Button } from '@heroui/react';
import { Plus } from '@/components/ui/icons';
import type { Call } from '@/app/types';
import { useDispatchExtras } from '@/extensions/dispatch';

/** Extension packs' marks beside a call's number (their `CallNumberMark`). */
export function CallNumberMarks({ call }: { call: Call }) {
  const { CallNumberMarks: marks } = useDispatchExtras();
  if (!marks.length) return null;
  return (
    <>
      {marks.map((Mark, i) => (
        <Mark key={i} call={call} />
      ))}
    </>
  );
}

/** Extension packs' items at the top of a call's + menu (their `CallAddMenuItems`). */
export function CallAddMenuExtras({ call }: { call: Call }) {
  const { CallAddMenuItems: items } = useDispatchExtras();
  return (
    <>
      {items.map((Items, i) => (
        <Items key={i} call={call} />
      ))}
    </>
  );
}

/**
 * A call's + button (the trigger of its add menu). It flashes amber while a pack has something in the menu
 * for dispatch (`callAddAttention`). Forwards its ref and props, as a menu trigger's child must.
 */
export const CallAddButton = React.forwardRef<HTMLButtonElement, { call: Call; disabled?: boolean; className?: string; testId?: string } & React.HTMLAttributes<HTMLButtonElement>>(
  function CallAddButton({ call, disabled, className = '', testId, ...rest }, ref) {
    const { callAddAttention } = useDispatchExtras();
    const attention = !disabled && callAddAttention(call);
    return (
      <Button
        {...(rest as object)}
        ref={ref}
        isIconOnly
        size="sm"
        variant="flat"
        aria-label={attention ? 'Add (something requested)' : 'Add'}
        data-testid={testId}
        data-attention={attention || undefined}
        isDisabled={disabled}
        className={`h-8 w-8 rounded-full hover:bg-surface-liner ${attention ? '!bg-status-orange !text-surface-deepest animate-pulse motion-reduce:animate-none' : ''} ${className}`}
      >
        <Plus className="h-4 w-4" />
      </Button>
    );
  },
);
