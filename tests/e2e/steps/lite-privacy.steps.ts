import type { Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';

const { Given, When, Then } = createBdd(test);

/** Every request URL and body this page sent, for the "never leaves the browser" check. */
const sent = new WeakMap<Page, string[]>();

Given('I record every request the page makes', async ({ page }) => {
  const log: string[] = [];
  sent.set(page, log);
  page.on('request', (request) => {
    log.push(`${request.method()} ${request.url()}\n${request.postData() ?? ''}`);
  });
});

Given('I am on the Lite start page', async ({ page }) => {
  await page.goto('/lite');
});

When('I open the Lite start page again', async ({ page }) => {
  await page.goto('/lite');
});

Then('I should see the Lite storage notice', async ({ page }) => {
  await expect(page.getByTestId('lite-storage-notice').first()).toContainText('never sent to CrowdCAD');
});

When('I start a Lite event with a unique name', async ({ page, scenarioState }) => {
  scenarioState.liteName = `PrivacyCheck${Date.now()}`;
  await page.getByLabel('Event Name').fill(scenarioState.liteName);
  await page.getByRole('button', { name: 'Start Lite Mode' }).click();
  await page.waitForURL(/\/lite\/create\?eventId=/, { timeout: NAV_TIMEOUT });
  // The create page saves the draft (with the name) to IndexedDB once it loads; the listing step checks it was.
  await page.waitForLoadState('networkidle');
});

Then("no request carried the Lite event's name", async ({ page, scenarioState }) => {
  const log = sent.get(page) ?? [];
  expect(log.length).toBeGreaterThan(0);
  expect(log.filter((entry) => entry.includes(scenarioState.liteName))).toEqual([]);
});

Then('the Lite event is listed as stored in this browser', async ({ page, scenarioState }) => {
  await expect(page.getByTestId('lite-stored-events')).toContainText(scenarioState.liteName, { timeout: NAV_TIMEOUT });
});

When('I delete the Lite event from this browser', async ({ page, scenarioState }) => {
  await page.getByRole('button', { name: `Delete ${scenarioState.liteName} from this browser` }).click();
  await page.getByTestId('confirm-dialog-confirm').click();
});

Then('the Lite event is no longer listed', async ({ page, scenarioState }) => {
  await expect(page.getByText(scenarioState.liteName)).toHaveCount(0, { timeout: NAV_TIMEOUT });
});
