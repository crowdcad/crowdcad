import { describe, expect, it } from 'vitest';
import { drawShortcut, emptyDraft, polygonDraftReducer as r, type PolygonDraft } from './polygonDraft';

type P = number;
const add = (s: PolygonDraft<P>, ...ps: P[]) => ps.reduce((acc, point) => r(acc, { type: 'add', point }), s);

describe('polygonDraftReducer', () => {
  it('adds points and undoes and redoes them in order', () => {
    let s = add(emptyDraft<P>(), 1, 2, 3);
    expect(s.points).toEqual([1, 2, 3]);
    s = r(s, { type: 'undo' });
    expect(s.points).toEqual([1, 2]);
    s = r(s, { type: 'undo' });
    expect(s.points).toEqual([1]);
    s = r(s, { type: 'redo' });
    expect(s.points).toEqual([1, 2]);
  });

  it('a new change clears redo', () => {
    let s = add(emptyDraft<P>(), 1, 2);
    s = r(s, { type: 'undo' });
    s = add(s, 9);
    expect(s.points).toEqual([1, 9]);
    expect(r(s, { type: 'redo' })).toBe(s);
  });

  it('closes only with enough points, and undo reopens', () => {
    let s = add(emptyDraft<P>(), 1, 2);
    expect(r(s, { type: 'close' })).toBe(s);
    s = r(add(s, 3), { type: 'close' });
    expect(s.closed).toBe(true);
    expect(r(s, { type: 'add', point: 4 })).toBe(s);
    s = r(s, { type: 'undo' });
    expect(s.closed).toBe(false);
    expect(s.points).toEqual([1, 2, 3]);
  });

  it('removes a selected middle point, and undo restores it', () => {
    let s = add(emptyDraft<P>(), 1, 2, 3, 4);
    s = r(s, { type: 'select', index: 1 });
    expect(s.selected).toBe(1);
    s = r(s, { type: 'remove' });
    expect(s.points).toEqual([1, 3, 4]);
    expect(s.selected).toBeNull();
    s = r(s, { type: 'undo' });
    expect(s.points).toEqual([1, 2, 3, 4]);
  });

  it('removing from a completed shape keeps it completed only while it has enough points', () => {
    let s = r(add(emptyDraft<P>(), 1, 2, 3, 4), { type: 'close' });
    s = r(s, { type: 'remove', index: 0 });
    expect(s).toMatchObject({ points: [2, 3, 4], closed: true });
    s = r(s, { type: 'remove', index: 0 });
    expect(s).toMatchObject({ points: [3, 4], closed: false });
  });

  it('remove with nothing selected does nothing', () => {
    const s = add(emptyDraft<P>(), 1, 2);
    expect(r(s, { type: 'remove' })).toBe(s);
  });

  it('selecting the selected point again deselects it; selection is not undoable', () => {
    let s = add(emptyDraft<P>(), 1, 2);
    s = r(s, { type: 'select', index: 0 });
    expect(s.past).toHaveLength(2);
    s = r(s, { type: 'select', index: 0 });
    expect(s.selected).toBeNull();
    expect(r(s, { type: 'select', index: 5 })).toBe(s);
  });

  it('clear is undoable; reset starts fresh history', () => {
    let s = r(add(emptyDraft<P>(), 1, 2, 3), { type: 'clear' });
    expect(s.points).toEqual([]);
    s = r(s, { type: 'undo' });
    expect(s.points).toEqual([1, 2, 3]);
    s = r(s, { type: 'reset', points: [7, 8, 9], closed: true });
    expect(s).toMatchObject({ points: [7, 8, 9], closed: true, past: [], future: [] });
  });
});

describe('drawShortcut', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    drawShortcut({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...mods });

  it('maps undo, redo and delete', () => {
    expect(key('z', { ctrlKey: true })).toBe('undo');
    expect(key('z', { metaKey: true })).toBe('undo');
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(key('y', { ctrlKey: true })).toBe('redo');
    expect(key('Delete')).toBe('remove');
    expect(key('Backspace')).toBe('remove');
    expect(key('z')).toBeNull();
    expect(key('z', { ctrlKey: true, altKey: true })).toBeNull();
  });

  it('ignores keys typed into a field', () => {
    const input = { closest: (sel: string) => (sel.includes('input') ? {} : null), isContentEditable: false } as unknown as EventTarget;
    expect(key('z', { ctrlKey: true, target: input })).toBeNull();
    expect(key('Backspace', { target: input })).toBeNull();
  });
});
