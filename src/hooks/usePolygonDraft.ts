'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { drawShortcut, emptyDraft, polygonDraftReducer, type PolygonDraft, type PolygonDraftAction } from '@/lib/polygonDraft';

export interface PolygonDraftControls<P> {
  points: P[];
  closed: boolean;
  selected: number | null;
  canUndo: boolean;
  canRedo: boolean;
  add: (point: P) => void;
  close: () => void;
  reopen: () => void;
  select: (index: number | null) => void;
  /** Removes the point at `index`, or the selected one. */
  remove: (index?: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  reset: (points?: P[], closed?: boolean) => void;
}

/**
 * An area being drawn (src/lib/polygonDraft.ts), plus its keyboard shortcuts
 * while `shortcuts` is on: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo,
 * Delete or Backspace to remove the selected point. Shortcuts are ignored
 * while typing in a field.
 */
export function usePolygonDraft<P>(initial?: { points?: P[]; closed?: boolean }, shortcuts = true): PolygonDraftControls<P> {
  const [state, dispatch] = useReducer(
    polygonDraftReducer as (s: PolygonDraft<P>, a: PolygonDraftAction<P>) => PolygonDraft<P>,
    initial,
    (init) => emptyDraft<P>(init?.points ?? [], init?.closed ?? false),
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!shortcuts) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const action = drawShortcut(e);
      if (!action) return;
      const s = stateRef.current;
      // Leave the key alone when there's nothing to do, so e.g. Backspace still works elsewhere.
      if (action === 'undo' && !s.past.length) return;
      if (action === 'redo' && !s.future.length) return;
      if (action === 'remove' && s.selected === null) return;
      e.preventDefault();
      dispatch({ type: action } as PolygonDraftAction<P>);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);

  const actions = useMemo(
    () => ({
      add: (point: P) => dispatch({ type: 'add', point }),
      close: () => dispatch({ type: 'close' }),
      reopen: () => dispatch({ type: 'reopen' }),
      select: (index: number | null) => dispatch({ type: 'select', index }),
      remove: (index?: number) => dispatch({ type: 'remove', index }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      clear: () => dispatch({ type: 'clear' }),
      reset: (points: P[] = [], closed = false) => dispatch({ type: 'reset', points, closed }),
    }),
    [],
  );

  return {
    points: state.points,
    closed: state.closed,
    selected: state.selected,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    ...actions,
  };
}
