import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';
import { uniqueSuffix } from '../helpers/unique';

const { Given, When, Then } = createBdd(test);

/**
 * Background step: creates a venue and navigates to the selection page.
 * Stores the venue name in scenarioState for later assertions.
 */
Given('I have a venue on the selection page', async ({ page, scenarioState }) => {
  scenarioState.deletionVenueName = `Del-Venue-${uniqueSuffix()}`;
  await page.goto('/venues/management', { timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});
  await page.getByPlaceholder('e.g., Convention Center Hall A').fill(scenarioState.deletionVenueName);
  await page.getByRole('button', { name: /^Review:/ }).click();
  await page.getByRole('button', { name: 'Create Venue' }).click();
  await page.waitForURL('/venues/selection', { timeout: NAV_TIMEOUT });
  await expect(page.getByText(scenarioState.deletionVenueName, { exact: true })).toBeVisible();
});

When('I open the venue actions menu', async ({ page, scenarioState }) => {
  // Find the h3 heading for our venue, then XPath up to the nearest ancestor div
  // that contains the "Venue actions" button and click it. This avoids selecting
  // outer container divs that contain all buttons (strict-mode violation).
  const heading = page.getByRole('heading', { name: scenarioState.deletionVenueName, level: 3 });
  const trigger = heading.locator(
    'xpath=ancestor::div[.//button[@aria-label="Venue actions"]][1]//button[@aria-label="Venue actions"]'
  );
  // The list is still settling right after the venue is created (realtime
  // updates from parallel tests, see "I confirm venue deletion"), and a click
  // in that window can leave the menu closed. Retry until it is open.
  const menu = page.getByRole('menu', { name: 'Venue actions' });
  await expect(async () => {
    if (!(await menu.isVisible())) {
      await page.keyboard.press('Escape');
      await trigger.click();
    }
    await expect(menu).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
});

When('I confirm venue deletion', async ({ page, scenarioState }) => {
  // A PocketBase realtime subscription update from a parallel test can close the dropdown
  // mid-animation between the "open menu" step and this one. The Delete menuitem may be
  // briefly "visible" but unstable (animating out) when Playwright tries to click it.
  // Fix: press Escape to flush any open/closing dropdown, then re-open fresh.
  await page.keyboard.press('Escape');
  const heading = page.getByRole('heading', { name: scenarioState.deletionVenueName, level: 3 });
  await heading
    .locator('xpath=ancestor::div[.//button[@aria-label="Venue actions"]][1]//button[@aria-label="Venue actions"]')
    .click();
  // Register a dialog handler to accept the window.confirm before clicking Delete
  page.once('dialog', dialog => dialog.accept());
  // force:true bypasses Playwright's stability/scroll checks that cause the
  // HeroUI dropdown to re-render and detach the element mid-click
  await page.getByRole('menuitem', { name: 'Delete' }).click({ force: true });
});

When('I cancel venue deletion', async ({ page, scenarioState }) => {
  // Same race condition as above — press Escape to flush, then re-open fresh.
  await page.keyboard.press('Escape');
  const heading = page.getByRole('heading', { name: scenarioState.deletionVenueName, level: 3 });
  await heading
    .locator('xpath=ancestor::div[.//button[@aria-label="Venue actions"]][1]//button[@aria-label="Venue actions"]')
    .click();
  // Register a dialog handler to dismiss the window.confirm
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('menuitem', { name: 'Delete' }).click({ force: true });
});

Then('the venue should no longer be visible', async ({ page, scenarioState }) => {
  await expect(page.getByText(scenarioState.deletionVenueName, { exact: true })).not.toBeVisible({ timeout: 5_000 });
});

Then('the venue should still be visible', async ({ page, scenarioState }) => {
  await expect(page.getByText(scenarioState.deletionVenueName, { exact: true })).toBeVisible();
});
