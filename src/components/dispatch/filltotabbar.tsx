'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Fills the space from its own top edge down to the mobile dispatch tab bar
 * (fixed at the bottom), so the Map tab reaches the tab buttons on any screen.
 * Measured, because what sits above it (the sticky surge strip) changes height.
 */
export default function FillToTabBar({ tabBarLabel, className, children }: { tabBarLabel: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const bar = document.querySelector(`[role="tablist"][aria-label="${tabBarLabel}"]`);
      const bottom = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      setHeight(Math.max(200, Math.floor(bottom - el.getBoundingClientRect().top)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [tabBarLabel]);

  return (
    <div ref={ref} className={className} style={{ height }}>
      {children}
    </div>
  );
}
