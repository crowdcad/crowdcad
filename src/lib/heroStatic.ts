// HeroUI's press feedback (ripple, press scale, hover/press background) is
// off for dropdown chevrons and modal close (X) buttons, app-wide. Enforced by
// lint (eslint.config.mjs) and described in docs/COMPONENTS.md.

/** Every Autocomplete: `selectorButtonProps={staticSelectorButtonProps}`. Opening it only flips the arrow. */
export const staticSelectorButtonProps = {
  disableRipple: true,
  disableAnimation: true,
  className: 'data-[hover=true]:bg-transparent data-[pressed=true]:bg-transparent',
};

/** Every Modal that shows its X (no `hideCloseButton`): `classNames={{ closeButton: STATIC_CLOSE_BUTTON_CLASS }}`. */
export const STATIC_CLOSE_BUTTON_CLASS = 'transition-none hover:bg-transparent active:bg-transparent';
