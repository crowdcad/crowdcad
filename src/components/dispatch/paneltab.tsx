"use client";

import React from 'react';

type PanelTabProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> & {
  active: boolean;
  onSelect: () => void;
};

// Folder-style tab that joins the panel beneath it when active. Shape and
// active background come from `.tab-chrome` in globals.css — only color is
// transitioned here so the background and its ::after bridge swap in lockstep.
// forwardRef + rest props so it can sit directly inside a HeroUI <Tooltip>.
const PanelTab = React.forwardRef<HTMLButtonElement, PanelTabProps>(function PanelTab(
  { active, onSelect, children, className, ...rest },
  ref
) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`tab-chrome h-10 px-4 text-[15px] sm:text-base font-semibold transition-[color] ${
        active ? 'tab-active' : 'text-surface-faint hover:text-surface-light'
      }${className ? ` ${className}` : ''}`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
});

export default PanelTab;
