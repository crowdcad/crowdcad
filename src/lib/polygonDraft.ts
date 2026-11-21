/**
 * An area being drawn, point by point, with undo and redo. Shared by every
 * area-drawing surface (a venue's map area, zones on an image or live map, MCI
 * zones) through usePolygonDraft. Pure, so it is unit tested on its own.
 *
 * - Points are added in order; the shape is `closed` once completed.
 * - A point can be selected and removed. Removing one from a completed shape
 *   keeps it completed while MIN_POINTS or more remain, else reopens it.
 * - Every change to the points or `closed` can be undone and redone.
 *   Selecting a point is not a change.
 */

export const MIN_POINTS = 3;
const HISTORY_LIMIT = 200;

interface Shape<P> {
  points: P[];
  closed: boolean;
}

export interface PolygonDraft<P> extends Shape<P> {
  /** Index of the selected point, or null. */
  selected: number | null;
  past: Shape<P>[];
  future: Shape<P>[];
}

export type PolygonDraftAction<P> =
  | { type: 'add'; point: P }
  | { type: 'close' }
  | { type: 'reopen' }
  | { type: 'select'; index: number | null }
  | { type: 'remove'; index?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }
  | { type: 'reset'; points: P[]; closed: boolean };

export function emptyDraft<P>(points: P[] = [], closed = false): PolygonDraft<P> {
  return { points, closed: closed && points.length >= MIN_POINTS, selected: null, past: [], future: [] };
}

/** Applies a change, recording the previous shape for undo and clearing redo. */
function commit<P>(state: PolygonDraft<P>, next: Shape<P>, selected: number | null = null): PolygonDraft<P> {
  const past = [...state.past, { points: state.points, closed: state.closed }].slice(-HISTORY_LIMIT);
  return { ...next, selected, past, future: [] };
}

export function polygonDraftReducer<P>(state: PolygonDraft<P>, action: PolygonDraftAction<P>): PolygonDraft<P> {
  switch (action.type) {
    case 'add':
      if (state.closed) return state;
      return commit(state, { points: [...state.points, action.point], closed: false });
    case 'close':
      if (state.closed || state.points.length < MIN_POINTS) return state;
      return commit(state, { points: state.points, closed: true });
    case 'reopen':
      if (!state.closed) return state;
      return commit(state, { points: state.points, closed: false });
    case 'select': {
      const index = action.index;
      if (index !== null && (index < 0 || index >= state.points.length)) return state;
      return { ...state, selected: index === state.selected ? null : index };
    }
    case 'remove': {
      const index = action.index ?? state.selected;
      if (index === null || index < 0 || index >= state.points.length) return state;
      const points = state.points.filter((_, i) => i !== index);
      return commit(state, { points, closed: state.closed && points.length >= MIN_POINTS });
    }
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...prev,
        selected: null,
        past: state.past.slice(0, -1),
        future: [{ points: state.points, closed: state.closed }, ...state.future],
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...next,
        selected: null,
        past: [...state.past, { points: state.points, closed: state.closed }],
        future: state.future.slice(1),
      };
    }
    case 'clear':
      if (!state.points.length) return state;
      return commit(state, { points: [], closed: false });
    case 'reset':
      return emptyDraft(action.points, action.closed);
  }
}

/**
 * Whether a key press is a drawing shortcut, and which. Ctrl/Cmd+Z undoes,
 * Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, Delete or Backspace removes the selected
 * point. Ignored while typing in a field.
 */
export function drawShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'>): 'undo' | 'redo' | 'remove' | null {
  if (isTypingTarget(e.target)) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (mod && !e.altKey && !e.shiftKey && key === 'y') return 'redo';
  if (!mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) return 'remove';
  return null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="textbox"]');
}
