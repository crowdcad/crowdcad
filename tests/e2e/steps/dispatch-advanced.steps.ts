import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';
import { uniqueSuffix } from '../helpers/unique';

const { Given, When, Then } = createBdd(test);

Given('I have a venue with location {string} and equipment {string} and am on the dispatch page', async ({ page }, location: string, equipment: string) => {
  const venueName = `AdvVenue-${uniqueSuffix()}`;

  await page.goto('/venues/management', { timeout: NAV_TIMEOUT });
  await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});
  await page.getByPlaceholder('e.g., Convention Center Hall A').fill(venueName);

  // Add location on the Locations step
  await page.getByRole('button', { name: /^Locations:/ }).click();
  await page.getByPlaceholder('e.g., Main Entrance').fill(location);
  await page.keyboard.press('Enter');

  // Add equipment on the Equipment step
  await page.getByRole('button', { name: /^Equipment:/ }).click();
  await page.getByPlaceholder('e.g., Gurney 1').fill(equipment);
  await page.keyboard.press('Enter');

  // Create venue and navigate to selection
  await page.getByRole('button', { name: /^Review:/ }).click();
  await page.getByRole('button', { name: 'Create Venue' }).click();
  await page.waitForURL('/venues/selection', { timeout: NAV_TIMEOUT });
  const venueLink = page.getByText(venueName, { exact: true });
  await expect(venueLink).toBeVisible();
  await venueLink.click();
  await page.getByRole('button', { name: 'Start New Event' }).click();
  await page.waitForURL(/\/events\/.*\/create/, { timeout: NAV_TIMEOUT });

  await page.getByPlaceholder('Enter event name').fill(`Adv Event ${uniqueSuffix()}`);
  await page.getByRole('button', { name: /^Review:/ }).click();
  await page.getByRole('button', { name: 'Create Event' }).click();
  await page.waitForURL(/\/events\/.*\/dispatch/, { timeout: NAV_TIMEOUT });
  await page.locator('[aria-label="Select section"]').waitFor({ state: 'visible', timeout: 20_000 });
});

When('I change equipment {string} status to {string}', async ({ page }, equipName: string, newStatus: string) => {
  const card = page.getByTestId(`equipment-card-${equipName}`);
  const trigger = card.locator('[aria-label="Status"]');
  const option = page.locator('[role="listbox"]').getByText(newStatus, { exact: true });

  // HeroUI's Select popover can spuriously close/remount right after opening (a known
  // react-aria Popover timing quirk — see the guard on the team-status Dropdown in
  // calltracking.tsx for the same root cause). Retry the open+click as a unit instead of
  // clicking once, so a mid-flight remount just triggers another attempt.
  await expect(async () => {
    await trigger.click();
    await option.click({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

Then('the equipment {string} should show status {string}', async ({ page }, equipName: string, status: string) => {
  const card = page.getByTestId(`equipment-card-${equipName}`);
  // HeroUI Select renders two [data-slot="value"] spans per Select (trigger + hidden a11y copy);
  // .first() targets the visible trigger span
  await expect(card.locator('[aria-label="Status"] [data-slot="value"]').first()).toHaveText(status);
});

// Equipment runs (src/lib/equipmentCustody.ts)

When('I send team {string} with equipment {string} on the latest call', async ({ page }, teamName: string, equipName: string) => {
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Add Equipment' }).click();
  await page.getByTestId(`add-equipment-${equipName}`).click();
  await page.getByRole('menuitem', { name: teamName }).click();
});

Then('the equipment {string} should show custody {string}', async ({ page }, equipName: string, custody: string) => {
  await expect(page.getByTestId(`equipment-custody-${equipName}`)).toHaveText(custody);
});

Then('the equipment {string} should show no custody line', async ({ page }, equipName: string) => {
  await expect(page.getByTestId(`equipment-custody-${equipName}`)).toHaveCount(0);
});

When('I set team {string} card status to {string}', async ({ page }, teamName: string, status: string) => {
  const trigger = page.getByTestId(`team-card-${teamName}`).locator('[aria-label="Status"]');
  const option = page.locator('[role="listbox"]').getByText(status, { exact: true });
  // Same Select open-and-pick retry as the equipment status step above.
  await expect(async () => {
    await trigger.click();
    await option.click({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
});

When('I move equipment {string} to {string}', async ({ page }, equipName: string, location: string) => {
  const input = page.getByTestId(`equipment-card-${equipName}`).getByRole('combobox', { name: 'Location' });
  await input.fill(location);
  await input.press('Enter');
});

When('I mark equipment {string} returned', async ({ page }, equipName: string) => {
  await page.getByTestId(`equipment-card-${equipName}`).getByRole('button', { name: 'Equipment actions' }).click();
  await page.getByRole('menuitem', { name: /^Mark Returned/ }).click();
});
