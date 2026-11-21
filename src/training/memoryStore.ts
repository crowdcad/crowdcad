import type { LiteEventDraft, LiteEventStore } from '@/lib/liteEventStore';

/**
 * A Lite event store that lives only in this tab's memory. Training sessions
 * use it so nothing a trainee types is written anywhere: closing or leaving
 * the module discards it. `put` replaces the event from outside the page
 * ("Do it for me", jumping to a step) and tells the page through `subscribe`.
 */
export interface MemoryLiteStore extends LiteEventStore {
  /** Replace the event and notify the page (and any other listener). */
  put(event: LiteEventDraft): void;
  /** The event right now, synchronously. */
  peek(eventId: string): LiteEventDraft | null;
  /** Listen to every change, including the page's own saves. */
  listen(onChange: (event: LiteEventDraft) => void): () => void;
}

export function createMemoryLiteStore(initial?: LiteEventDraft): MemoryLiteStore {
  const events = new Map<string, LiteEventDraft>();
  const byEvent = new Map<string, Set<(event: LiteEventDraft | null) => void>>();
  const all = new Set<(event: LiteEventDraft) => void>();
  if (initial) events.set(initial.id, structuredClone(initial));

  const emit = (event: LiteEventDraft, includePage: boolean) => {
    if (includePage) for (const cb of byEvent.get(event.id) ?? []) cb(structuredClone(event));
    for (const cb of all) cb(event);
  };

  return {
    async get(eventId) {
      const event = events.get(eventId);
      return event ? structuredClone(event) : null;
    },
    async save(event) {
      const saved = { ...structuredClone(event), updatedAt: new Date().toISOString() };
      events.set(event.id, saved);
      // The page already has its own save; only outside listeners need it.
      emit(saved, false);
    },
    async delete(eventId) {
      events.delete(eventId);
      for (const cb of byEvent.get(eventId) ?? []) cb(null);
    },
    subscribe(eventId, onChange) {
      const set = byEvent.get(eventId) ?? new Set();
      set.add(onChange);
      byEvent.set(eventId, set);
      return () => set.delete(onChange);
    },
    put(event) {
      const saved = { ...structuredClone(event), updatedAt: new Date().toISOString() };
      events.set(event.id, saved);
      emit(saved, true);
    },
    peek(eventId) {
      return events.get(eventId) ?? null;
    },
    listen(onChange) {
      all.add(onChange);
      return () => all.delete(onChange);
    },
  };
}
