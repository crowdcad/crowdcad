import React from 'react';

/**
 * A Lite-mode tutorial callout: an accent-blue box with a pointer on its top
 * edge, aimed at the control it describes. It overlays whatever is below
 * instead of taking space: render it inside a `relative` wrapper around that
 * control and place it with `className` (e.g. `top-full mt-2 left-0`). Place
 * the pointer with `arrowClassName` (e.g. `left-6`); `null` drops it.
 */
export default function TutorialTip({
  children,
  className = '',
  arrowClassName = 'left-6',
}: {
  children: React.ReactNode;
  className?: string;
  arrowClassName?: string | null;
}) {
  return (
    <div role="note" className={`pointer-events-none absolute z-30 max-w-[260px] rounded-lg bg-accent px-3 py-2 text-xs font-medium leading-snug text-accent-foreground shadow-lg ${className}`}>
      {arrowClassName !== null && (
        <span aria-hidden className={`absolute -top-2 h-2 w-4 bg-accent [clip-path:polygon(50%_0,100%_100%,0_100%)] ${arrowClassName}`} />
      )}
      {children}
    </div>
  );
}
