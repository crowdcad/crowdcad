import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

// ── Add Area mode ───────────────────────────────────────────────────────────────

When('I enable Add Area mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Area' }).click();
});

// Places three vertices around the map's center, then clicks the first
// vertex's open circle (AreaVertex) to complete the area — the only way a
// real user finishes a polygon.
When('I draw a triangular area on the venue map', async ({ page }) => {
  const mapImage = page.getByAltText('Venue map');
  const box = await mapImage.boundingBox();
  if (!box) throw new Error('Venue map image bounding box not found');

  const first = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.3 };
  const second = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.3 };
  const third = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };

  await page.mouse.click(first.x, first.y);
  await page.mouse.click(second.x, second.y);
  await page.mouse.click(third.x, third.y);
  await page.mouse.click(first.x, first.y);
});

When('I name the area {string}', async ({ page }, name: string) => {
  await page.getByPlaceholder('Lower concourse').fill(name);
  await page.getByRole('button', { name: 'Confirm' }).click();
});

When('I name the area {string} and mark it a dispatch zone', async ({ page }, name: string) => {
  await page.getByPlaceholder('Lower concourse').fill(name);
  // The label text sits under HeroUI's invisible native <input>, which
  // covers the whole control and intercepts a click aimed at the text
  // itself — target the checkbox by role instead.
  await page.getByRole('checkbox', { name: 'Mark as Dispatch Zone' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
});

// ── Locations step assertions ─────────────────────────────────────────────────────
// Scoped to the Areas list's own rows (data-testid="zone-row") rather than a
// bare "I should see the text" match — a zone's name also appears inside its
// map polygon's <title> (a native hover tooltip), so an unscoped text
// locator resolves to two elements and fails Playwright's strict mode.

Then('I should see the area {string} in the areas list', async ({ page }, name: string) => {
  await expect(page.getByTestId('zone-row').filter({ hasText: name })).toBeVisible();
});

Then('the area {string} should be marked as a dispatch zone', async ({ page }, name: string) => {
  await expect(page.getByTestId('zone-row').filter({ hasText: name }).getByText('Dispatch Zone')).toBeVisible();
});
