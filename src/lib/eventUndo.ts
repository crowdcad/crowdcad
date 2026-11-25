import type { Event } from '@/app/types';

/**
 * One level of undo for the dispatch page (Ctrl+Z): what the last write changed, and how to put it back.
 *
 * An undo reverts only what that write changed. In a list of items with an `id` (calls, teams, clinics,
 * equipment), items it added are removed, items it removed come back, and items it changed go back to how they
 * were, log lines included. Other items keep whatever has happened to them since, so a colleague's later edit
 * to another call survives. Anything else (a list without ids, a plain field) goes back as it was.
 */
export interface EventUndo {
  before: Partial<Event>;
  after: Partial<Event>;
}

/** Fields an undo never touches: they have their own history (the MCI log has its own undo). */
const NOT_UNDOABLE = new Set<string>(['mci']);

export function undoFor(before: Event, applied: Partial<Event>): EventUndo | null {
  const keys = Object.keys(applied);
  if (!keys.length || keys.some((k) => NOT_UNDOABLE.has(k))) return null;
  const was: Partial<Event> = {};
  for (const k of keys) (was as Record<string, unknown>)[k] = (before as unknown as Record<string, unknown>)[k];
  return { before: was, after: applied };
}

const idOf = (item: unknown): string | undefined => {
  if (!item || typeof item !== 'object') return undefined;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
};
const keyed = (list: unknown[]) => list.length > 0 && list.every((i) => idOf(i) !== undefined);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function revertList(current: unknown[], before: unknown[], after: unknown[]): unknown[] {
  const beforeById = new Map(before.map((i) => [idOf(i)!, i]));
  const afterById = new Map(after.map((i) => [idOf(i)!, i]));
  const added = new Set([...afterById.keys()].filter((id) => !beforeById.has(id)));
  const out = current.filter((i) => !added.has(idOf(i)!)).map((i) => {
    const id = idOf(i)!;
    const was = beforeById.get(id);
    const now = afterById.get(id);
    return was !== undefined && now !== undefined && !same(was, now) ? was : i;
  });
  // Items the write removed go back where they were.
  before.forEach((item, index) => {
    const id = idOf(item)!;
    if (afterById.has(id) || out.some((i) => idOf(i) === id)) return;
    out.splice(Math.min(index, out.length), 0, item);
  });
  return out;
}

/** The write that undoes `undo`, against the event as it is now. */
export function undoPatch(current: Event, undo: EventUndo): Partial<Event> {
  const patch: Record<string, unknown> = {};
  const now = current as unknown as Record<string, unknown>;
  for (const [k, after] of Object.entries(undo.after)) {
    const before = (undo.before as Record<string, unknown>)[k];
    const cur = now[k];
    const lists = Array.isArray(before) && Array.isArray(after) && Array.isArray(cur);
    if (lists && keyed([...before, ...after]) && keyed(cur as unknown[])) {
      patch[k] = revertList(cur as unknown[], before, after);
    } else if (before === undefined) {
      // The write added the field: an empty list, or nothing to put back.
      if (Array.isArray(after)) patch[k] = [];
    } else {
      patch[k] = before;
    }
  }
  return patch as Partial<Event>;
}
