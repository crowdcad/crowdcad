/** HeroUI field classNames shared across screens (no inner focus ring; see docs/COMPONENTS.md). */

const NO_FOCUS_RING = 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0';

/** A compact search or text field inside a panel (the Log search, MCI forms). */
export const PANEL_INPUT_CLASSNAMES = {
  inputWrapper: 'rounded-xl px-3',
  input: NO_FOCUS_RING,
} as const;
