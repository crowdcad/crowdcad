/** HeroUI field classNames shared across screens (no inner focus ring; see docs/COMPONENTS.md). */

const NO_FOCUS_RING = 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0';

/** A compact search or text field inside a panel (the Log search, MCI forms). */
export const PANEL_INPUT_CLASSNAMES = {
  inputWrapper: 'rounded-xl px-3',
  input: NO_FOCUS_RING,
} as const;

const PLAIN_INPUT = 'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none';
const FIELD_WRAPPER = 'rounded-large px-4 hover:bg-surface-deep';

/** A field in a modal or settings form, with its label above (add team, end event, sign in, ...). */
export const LABELED_FIELD_CLASSNAMES = { label: 'text-surface-light mb-1', inputWrapper: FIELD_WRAPPER, input: PLAIN_INPUT } as const;

/** The same field without a label (Profile settings, admin lists). */
export const FIELD_CLASSNAMES = { inputWrapper: FIELD_WRAPPER, input: PLAIN_INPUT } as const;

/** The same at small text size (equipment lists in venue and event setup). */
export const SMALL_FIELD_CLASSNAMES = { input: `text-surface-light text-sm outline-none focus:outline-none data-[focus=true]:outline-none`, inputWrapper: FIELD_WRAPPER } as const;

/** A full-page form's field with a medium-weight label and no focus ring (reset password, edit profile). */
export const FORM_FIELD_CLASSNAMES = { label: 'text-surface-light font-medium', input: NO_FOCUS_RING, inputWrapper: FIELD_WRAPPER } as const;

/** The search box above a list (venue selection). */
export const LIST_SEARCH_CLASSNAMES = { base: 'mb-4', inputWrapper: 'bg-surface-deep', input: 'outline-none focus:outline-none data-[focus=true]:outline-none' } as const;

/** A large field in a short form modal (transport unit, clinic walk-up, quick call). */
export const MODAL_FIELD_CLASSNAMES = { label: 'text-surface-light mb-1', inputWrapper: 'rounded-2xl px-4 hover:bg-surface-deep', input: PLAIN_INPUT } as const;
