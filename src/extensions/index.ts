/**
 * The extension pack registry (src/extensions/types.ts). Every helper works,
 * and does nothing, when no pack is installed.
 *
 * Packs install once at startup (src/extensions/installed.ts, run by
 * ExtensionsBoot in the root layout and by the unit-test setup), after modules
 * load. So read the registry when it's needed (in a function, a hook or a
 * render), never in module-level code. This module imports no pack, so shared
 * code importing it never pulls pack code in, and there are no import cycles.
 */
import type { Event } from '@/app/types';
import type { AppEventName, AppEvents, CrowdcadExtension, DispatchContribution, DispatchHost, EventDataStore, SummaryContribution } from './types';

export type * from './types';

const installed: CrowdcadExtension[] = [];

/** Installs a build's packs (src/extensions/installed.ts calls it once). */
export function installExtensions(packs: readonly CrowdcadExtension[]): void {
  installed.splice(0, installed.length, ...packs);
}

/** The installed packs (a live list: read it when needed, see above). */
export const extensions: readonly CrowdcadExtension[] = installed;

/** Packs that define member `key`, with it narrowed to non-undefined. */
export function withMember<K extends keyof CrowdcadExtension>(key: K): (CrowdcadExtension & Required<Pick<CrowdcadExtension, K>>)[] {
  return extensions.filter((e) => e[key] !== undefined) as (CrowdcadExtension & Required<Pick<CrowdcadExtension, K>>)[];
}

/** The first non-null answer from the packs, else null. */
export function firstOf<T>(pick: (ext: CrowdcadExtension) => T | null | undefined): T | null {
  for (const ext of extensions) {
    const v = pick(ext);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** Tells every pack that something happened. Handlers run in the background; a failing one is logged, never thrown. */
export function emit<K extends AppEventName>(name: K, payload: AppEvents[K]): void {
  for (const ext of extensions) {
    const handler = ext.on?.[name] as ((p: AppEvents[K]) => void | Promise<void>) | undefined;
    if (!handler) continue;
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error(`[${ext.id}] ${name} handler failed:`, err));
  }
}


/**
 * Every pack's contribution to this render of the dispatch page. Packs are
 * fixed for a build, so the number and order of these hook calls never changes.
 */
export function useDispatchContributions(host: DispatchHost): DispatchContribution[] {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed list per build (see above)
  return withMember('useDispatch').map((x) => x.useDispatch(host));
}

/** Every pack's contribution to this render of the summary page (same fixed-list rule as above). */
export function useSummaryContributions(...args: Parameters<NonNullable<CrowdcadExtension['useSummary']>>): SummaryContribution[] {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed list per build
  return withMember('useSummary').map((x) => x.useSummary(...args));
}

/** Packs that keep their own documents beside the event (cloud events on Firebase). */
export const eventDataStores = (): EventDataStore[] => extensions.flatMap((x) => (x.eventData ? [x.eventData] : []));

/** Merges every pack's own documents into an event read once (no live updates). */
export async function loadExtensionData(eventId: string, event: Event): Promise<Event> {
  let merged = event;
  for (const store of eventDataStores()) merged = store.merge(merged, await store.load(eventId));
  return merged;
}

/** Every pack's chance to keep its local copy of an incoming snapshot (see CrowdcadExtension.freshen). */
export function freshenSnapshot(prev: Event | undefined, incoming: Event): Event {
  return extensions.reduce((event, x) => (x.freshen ? x.freshen(prev, event) : event), incoming);
}

/** Whether any pack wants automatic alerts off right now. */
export function alertsMuted(event: Event): boolean {
  return extensions.some((x) => x.alertsMuted?.(event));
}
