// Autocomplete dropdown chevrons in dispatch: no press scale, ripple or
// hover/press background on the chevron button. Opening the list only
// flips the arrow (HeroUI's own data-[open=true]:rotate-180).
export const staticSelectorButtonProps = { disableRipple: true, disableAnimation: true };

export const STATIC_SELECTOR_BUTTON_CLASS =
  'data-[hover=true]:bg-transparent data-[pressed=true]:bg-transparent';
