/** HeroUI field classNames shared by cloud and Lite event creation (no inner focus ring; see docs/COMPONENTS.md). */
export const EVENT_INPUT_CLASSNAMES = {
  label: 'text-surface-light font-medium',
  inputWrapper: 'rounded-large px-4',
  input: 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
};

export const EVENT_SELECT_CLASSNAMES = {
  label: 'text-surface-light font-medium',
  input: 'text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none',
  inputWrapper: 'rounded-large px-4 pr-6 shadow-none group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
};
