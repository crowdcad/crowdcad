/**
 * HeroUI Input/Autocomplete `classNames` for TAK text and search fields.
 * The browser draws a focus ring on the inner <input> as well as HeroUI's
 * own wrapper styling; removing it on the `input` slot matches core's fields
 * (e.g. the Add Call modal). See docs/COMPONENTS.md, "Text inputs".
 */
export const TAK_INPUT_CLASSNAMES = {
  input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;
