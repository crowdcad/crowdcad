import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';

const { When, Then } = createBdd(test);

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

When('I declare an MCI with zones {string} and {string} and the default clinic', async ({ page }, zoneA: string, zoneB: string) => {
  await page.getByTestId('mci-declare-button').click();
  const dialog = page.getByTestId('mci-declare-modal');
  await expect(dialog).toBeVisible();
  for (const zone of [zoneA, zoneB]) {
    await dialog.getByTestId('mci-declare-zone-input').fill(zone);
    await dialog.getByTestId('mci-declare-zone-add').click();
  }
  // The event's clinic is ticked by default.
  await dialog.getByTestId('mci-declare-confirm').click();
  await expect(page.getByTestId('mci-tab')).toBeVisible({ timeout: NAV_TIMEOUT });
});

When('I tag {int} {string} patients in zone {string}', async ({ page }, count: number, color: string, zone: string) => {
  const plus = page.getByRole('button', { name: `Add one ${color} to ${zone}` });
  for (let i = 0; i < count; i++) await plus.click();
});

Then('zone {string} should show {int} {string} patients in the zone', async ({ page }, zone: string, count: number, color: string) => {
  await expect(page.getByTestId(`mci-zone-${zone}-${color}-inzone`)).toHaveText(String(count));
});

When('I move all patients from zone {string} to {string}', async ({ page }, zone: string, area: string) => {
  await page.getByTestId(`mci-zone-move-${zone}`).click();
  const dialog = page.getByTestId('mci-move-modal');
  await expect(dialog).toBeVisible();
  // The treatment location defaults to the first one (the clinic); the counts are prefilled with what is in the zone.
  await expect(dialog.getByTestId('mci-move-area')).toContainText(area);
  await dialog.getByTestId('mci-move-confirm').click();
  await expect(dialog).not.toBeVisible();
});

Then('the treatment location {string} should read {string}', async ({ page }, area: string, text: string) => {
  await expect(page.getByTestId(`mci-area-combined-${area}`)).toHaveText(text);
});

When('I mark zone {string} clear', async ({ page }, zone: string) => {
  await page.getByTestId(`mci-zone-clear-${zone}`).click();
  await expect(page.getByTestId(`mci-zone-cleared-${zone}`)).toBeVisible();
});

When('I stand down the MCI', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('mci-stand-down').click();
});

When('I open the MCI summary from the event summary', async ({ page }) => {
  await page.getByRole('button', { name: 'Event Summary' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'View Full Summary' }).click();
  await page.waitForURL(/\/events\/.*\/summary/, { timeout: NAV_TIMEOUT });
  await expect(page.getByTestId('mci-summary')).toBeVisible({ timeout: NAV_TIMEOUT });
});

Then('the MCI summary should list zone {string} with {int} tagged and {int} moved', async ({ page }, zone: string, tagged: number, moved: number) => {
  const row = page.getByTestId('mci-summary-zones').getByRole('row', { name: new RegExp(`^${capitalize(zone)}`) });
  const cells = row.getByRole('cell');
  // Zone, four colors, Tagged, Moved, Still in zone, Cleared.
  await expect(cells.nth(5)).toHaveText(String(tagged));
  await expect(cells.nth(6)).toHaveText(String(moved));
});

When('I transport {int} {string} patients from {string} in ambulance {string}', async ({ page }, count: number, color: string, area: string, unit: string) => {
  await page.getByTestId(`mci-area-transport-${area}`).click();
  const dialog = page.getByTestId('mci-transport-modal');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('mci-transport-unit').fill(unit);
  await dialog.getByTestId(`mci-transport-${color}`).fill(String(count));
  await dialog.getByTestId('mci-transport-confirm').click();
  await expect(dialog).not.toBeVisible();
});

Then('the MCI summary should list treatment location {string} with {int} transported', async ({ page }, area: string, transported: number) => {
  const row = page.getByTestId('mci-summary-areas').getByRole('row', { name: new RegExp(`^${capitalize(area)}`) });
  // Location, four colors, received, transported, still here.
  await expect(row.getByRole('cell').nth(6)).toHaveText(String(transported));
});
