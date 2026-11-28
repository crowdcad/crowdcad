import { expect, type Page } from '@playwright/test';
import { NAV_TIMEOUT } from '../timeouts';
import { uniqueSuffix } from './unique';

/**
 * Creates a venue and an event at it, and waits for the event's dispatch page. `onBasics` runs on the builder's
 * basics step, after the name is filled (e.g. to pick a setting).
 */
export async function createEventAndOpenDispatch(page: Page, onBasics?: () => Promise<void>) {
  // Best-effort networkidle: gives the auth token validation (and any
  // initial Firestore calls) a chance to settle before we interact with the
  // form, but doesn't hard-fail — a backend with an open real-time channel
  // (e.g. Firestore's Listen/Write long-poll) never reaches true idle.
  const venueName = `Dispatch-Venue-${uniqueSuffix()}`;
  await page.goto('/venues/management', { timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});
  await page.getByPlaceholder('e.g., Convention Center Hall A').fill(venueName);
  await page.getByRole('button', { name: /^Review:/ }).click();
  await page.getByRole('button', { name: 'Create Venue' }).click();
  await page.waitForURL('/venues/selection', { timeout: NAV_TIMEOUT });

  // Select the venue and start a new event
  const venueLink = page.getByText(venueName, { exact: true });
  await expect(venueLink).toBeVisible();
  await venueLink.click();
  await page.getByRole('button', { name: 'Start New Event' }).click();
  await page.waitForURL(/\/events\/.*\/create/, { timeout: 10_000 });

  // Name and launch the event (auth.currentUser stays set across SPA navigation)
  await page.getByPlaceholder('Enter event name').fill(`Test Event ${uniqueSuffix()}`);
  await onBasics?.();
  await page.getByRole('button', { name: /^Review:/ }).click();
  await page.getByRole('button', { name: 'Create Event' }).click();
  await page.waitForURL(/\/events\/.*\/dispatch/, { timeout: NAV_TIMEOUT });
  // Wait for the dispatch page to hydrate before asserting
  await page.locator('[aria-label="Select section"]').waitFor({ state: 'visible', timeout: 20_000 });
}
