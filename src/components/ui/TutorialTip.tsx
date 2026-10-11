import React from 'react';

/**
 * A Lite-mode tutorial callout: an accent-blue box with a pointer on its top
 * edge, aimed at the control it describes. It sits in the flow under that
 * control, or with `floating` overlays what is below a `relative` wrapper
 * around it (give its side with `className`, e.g. `left-0`). Place the pointer with
 * `arrowClassName` (e.g. `left-6`); `arrowClassName={null}` drops it.
 */
export default function TutorialTip({
  step,
  children,
  floating = false,
  className = '',
  arrowClassName = 'left-6',
}: {
  floating?: boolean;
  /** Shown as "Step N:" before the text. */
  step?: number;
  children: React.ReactNode;
  className?: string;
  arrowClassName?: string | null;
}) {
  return (
    <div role="note" className={`${floating ? 'absolute top-full mt-2' : 'relative'} z-20 max-w-[260px] rounded-lg bg-accent px-3 py-2 text-xs font-medium leading-snug text-accent-foreground shadow-lg ${className}`}>
      {arrowClassName !== null && (
        <span aria-hidden className={`absolute -top-2 h-2 w-4 bg-accent [clip-path:polygon(50%_0,100%_100%,0_100%)] ${arrowClassName}`} />
      )}
      {step !== undefined && <span className="font-semibold">Step {step}: </span>}
      {children}
    </div>
  );
}
