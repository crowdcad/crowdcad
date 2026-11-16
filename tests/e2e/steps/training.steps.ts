import { createBdd } from 'playwright-bdd';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';

const { Given, When, Then } = createBdd(test);

/**
 * Training (docs/TRAINING.md). Each module is walked with its own "Do it
 * for me" button, which presses the real controls (UI steps) or applies the
 * step (data steps): a step whose control is gone, renamed or no longer
 * opens what it should leaves the walk stuck on that step and fails here.
 */

const stepTitle = (page: Page) => page.getByTestId('training-step-title');

async function openModule(page: Page, id: string, step?: string) {
  await page.goto(`/training/${id}${step ? `?step=${step}` : ''}`);
  await expect(page.getByTestId('training-card')).toBeVisible({ timeout: NAV_TIMEOUT });
  // The board renders from the in-memory store; wait for its first panel.
  await expect(page.getByTestId('right-panel')).toBeVisible({ timeout: NAV_TIMEOUT });
}

Given('I open the training catalog', async ({ page }) => {
  await page.goto('/training');
  await expect(page.getByRole('heading', { name: 'Learn the dispatch board by using it' })).toBeVisible({ timeout: NAV_TIMEOUT });
});

Then('I should see the training track {string}', async ({ page }, track: string) => {
  await expect(page.getByTestId(`training-track-${track}`)).toBeVisible();
});

Then('every listed module should show an estimated time', async ({ page }) => {
  const cards = page.locator('[data-testid^="training-module-"]');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) await expect(card).toContainText(/\d+ min/);
});

Given('I open the training module {string}', async ({ page }, id: string) => {
  await openModule(page, id);
});

When('I advance the training to the {string} step', async ({ page }, step: string) => {
  // Each step's own "Next" / "Do it for me" until the card is on the step asked for.
  const card = page.getByTestId('training-card');
  for (let i = 0; i < 20; i++) {
    const at = await card.getAttribute('data-step-id');
    if (at === step) return;
    await page.getByTestId('training-primary').click();
    await expect(card).not.toHaveAttribute('data-step-id', at ?? '', { timeout: 10_000 });
  }
  await expect(card).toHaveAttribute('data-step-id', step);
});

When('I complete every step with {string}', async ({ page }) => {
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('training-complete').isVisible()) return;
    const title = (await stepTitle(page).textContent()) ?? '';
    await page.getByTestId('training-primary').click();
    // The step moves on once its control opened what it should, or the board changed.
    await expect(async () => {
      const done = await page.getByTestId('training-complete').isVisible();
      const now = done ? null : await stepTitle(page).textContent();
      expect(done || now !== title, `stuck on step "${title}"`).toBe(true);
    }).toPass({ timeout: 10_000 });
  }
});

Then('the training module should be complete', async ({ page }) => {
  await expect(page.getByTestId('training-complete')).toBeVisible();
});

Then('the board should be in free practice', async ({ page }) => {
  await expect(page.getByTestId('training-card')).toHaveAttribute('data-gate', 'free');
});

When('I add a call at {string} with complaint {string}', async ({ page }, location: string, complaint: string) => {
  const form = page.getByTestId('quick-call-modal');
  if (!(await form.isVisible())) {
    await page.getByTestId('calls-tab-button').click();
    await page.getByTestId('add-call-button').click();
  }
  await expect(form).toBeVisible();
  await form.getByRole('combobox', { name: 'Location' }).fill(location);
  await page.keyboard.press('Escape');
  await form.getByLabel('Chief Complaint').fill(complaint);
  await form.getByTestId('quick-call-submit').click();
});

Then('the training board should turn the write away', async ({ page }) => {
  await expect(page.getByTestId('training-gate-nudge')).toBeVisible();
});

Then('no call should be logged', async ({ page }) => {
  await expect(page.getByTestId('call-row-1')).toHaveCount(0);
});

Then('a call at {string} should be logged', async ({ page }, location: string) => {
  await page.getByTestId('calls-tab-button').click();
  await expect(page.locator('[data-testid^="call-row-"]').filter({ hasText: location }).first()).toBeVisible();
});

When('I open the training steps menu and pick section {int}', async ({ page }, n: number) => {
  await page.getByTestId('training-steps-menu').click();
  await page.getByTestId(`training-section-${n}`).click();
});

Then('the training step should be {string}', async ({ page }, title: string) => {
  await expect(stepTitle(page)).toHaveText(title);
});

When('I search Help for {string}', async ({ page }, query: string) => {
  await page.getByTestId('help-button').click();
  await page.getByTestId('help-search').fill(query);
});

Then('the first Help result should offer {string}', async ({ page }) => {
  await expect(page.getByTestId('help-results').locator('li').first().getByTestId('help-show-me')).toBeVisible();
});

When('I pick {string} on the first Help result', async ({ page }) => {
  await page.getByTestId('help-results').locator('li').first().getByTestId('help-show-me').click();
});

Then('the Help guide should point at {string}', async ({ page }, testId: string) => {
  await expect(page.getByTestId('help-live-guide')).toBeVisible();
  await expect(page.getByTestId(testId)).toBeVisible();
});
