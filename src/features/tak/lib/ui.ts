/**
 * HeroUI Input/Autocomplete `classNames` for TAK text and search fields: no
 * focus ring inside the field, neither the browser's on the inner <input> nor
 * HeroUI's blue ring on the wrapper (shown on keyboard focus and autofocus).
 * See docs/COMPONENTS.md, "Text inputs: no inner focus ring".
 */
export const TAK_INPUT_CLASSNAMES = {
  inputWrapper: 'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
  input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
} as const;
