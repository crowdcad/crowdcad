/**
 * Full-screen (focus) view of the dispatch board (#138). One side of the
 * board fills the screen, still showing its own tabs, so a dispatcher can go
 * from full-screen Calls to full-screen Map. The focused tab is kept in the
 * URL (`?focus=map`, `?focus=teams`, `?focus=<clinic id>`) so a reload keeps
 * it and it can be bookmarked or opened on a second screen.
 */

export type FocusPane = 'left' | 'right';

export const LEFT_FOCUS_TABS = ['teams', 'supervisors', 'equipment'] as const;

export const FOCUS_PARAM = 'focus';

/** The pane and tab a `focus` URL value names, or null for none or an empty value. */
export function parseFocus(value: string | null | undefined): { pane: FocusPane; tab: string } | null {
  const tab = value?.trim();
  if (!tab) return null;
  return { pane: (LEFT_FOCUS_TABS as readonly string[]).includes(tab) ? 'left' : 'right', tab };
}

/** The URL for a focus state: `search` with the focus parameter set to `tab`, or removed. */
export function focusSearch(search: string, tab: string | null): string {
  const params = new URLSearchParams(search);
  if (tab) params.set(FOCUS_PARAM, tab);
  else params.delete(FOCUS_PARAM);
  const out = params.toString();
  return out ? `?${out}` : '';
}
