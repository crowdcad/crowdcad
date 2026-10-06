import { closeEventConfig } from './data/takStore';

/**
 * Called by the dispatch page's end-event flow for TAK events: marks the
 * event's TAK config closed, so the bridge clears live positions and stops
 * writing. The event owner or an admin may do this (the same people who can
 * end an event).
 */
export async function onEventEnded(eventId: string): Promise<void> {
  await closeEventConfig(eventId);
}
