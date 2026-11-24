/**
 * Extension packs on the server: what they add to this app's server routes. The browser-side contract is
 * types.ts; this one is kept apart so a route never pulls a pack's UI in. Every helper works, and does
 * nothing, when no pack is installed (the public build).
 *
 * Packs install once per server process (installed.server.ts, imported by the routes that ask them).
 */
import type { ServerStore } from '@/lib/server/serverStore';

export interface ServerExtension {
  id: string;
  /**
   * Deletes what the pack keeps for an event outside the event's own documents, before an event is
   * deleted or purged (store.deleteTree takes everything under `events/{id}` itself). For example the
   * event's login accounts, or records a backend keeps in their own collections. Returns a short note for
   * the audit row ("3 logins"), or nothing.
   */
  deleteEventData?(store: ServerStore, eventId: string): Promise<string | void>;
}

const installed: ServerExtension[] = [];

/** Installs a build's server packs (installed.server.ts calls it once). */
export function installServerExtensions(packs: readonly ServerExtension[]): void {
  installed.splice(0, installed.length, ...packs);
}

/** The installed server packs (a live list: read it when needed). */
export const serverExtensions: readonly ServerExtension[] = installed;
