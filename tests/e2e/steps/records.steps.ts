import { readFile } from 'node:fs/promises';
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';

const { When, Then } = createBdd(test);

Then('clicking {string} should download the event\'s full record', async ({ page }, buttonName: string) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.getByRole('button', { name: buttonName }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/_Record_\d{4}-\d{2}-\d{2}\.json$/);
  const record = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(record.format).toBe('crowdcad.event-record');
  expect(record.event.calls).toHaveLength(1);
  expect(record.event.calls[0].log.length).toBeGreaterThan(0);
  expect(record.event.staff.map((s: { team: string }) => s.team)).toContain('SummaryTeam');
  expect(record.audit.map((r: { action: string }) => r.action)).toContain('event.create');
});

When('I place a legal hold on the event', async ({ page }) => {
  await page.getByTestId('legal-hold-toggle').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Place hold' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

When('I release the legal hold', async ({ page }) => {
  await page.getByTestId('legal-hold-toggle').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Release hold' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

When('I reload the page', async ({ page }) => {
  await page.reload();
  await expect(page.getByText('Event Summary:')).toBeVisible({ timeout: 15_000 });
});

Then('the event shows a legal hold', async ({ page }) => {
  await expect(page.getByTestId('legal-hold-chip')).toBeVisible();
  await expect(page.getByTestId('legal-hold-toggle')).toHaveText(/Release Hold/);
});

Then('the event shows no legal hold', async ({ page }) => {
  await expect(page.getByTestId('legal-hold-chip')).not.toBeVisible();
  await expect(page.getByTestId('legal-hold-toggle')).toHaveText(/Legal Hold/);
});
