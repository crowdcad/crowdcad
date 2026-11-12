import { createBdd } from 'playwright-bdd';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from '../fixtures';
import { NAV_TIMEOUT } from '../timeouts';

const { When, Then, After } = createBdd(test);

// The login made in this scenario and the second device using it.
let fresh: { username: string; password: string } | null = null;
let other: { context: BrowserContext; page: Page } | null = null;

After(async () => {
  await other?.context.close();
  other = null;
  fresh = null;
});

When('I declare an MCI and keep the role logins open', async ({ page }) => {
  await page.getByTestId('mci-declare-button').click();
  const dialog = page.getByTestId('mci-declare-modal');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('mci-declare-zone-input').fill('Zone A');
  await dialog.getByTestId('mci-declare-zone-add').click();
  await dialog.getByTestId('mci-declare-confirm').click();
  // Declaring offers role logins straight away.
  await expect(page.getByTestId('role-logins-modal')).toBeVisible({ timeout: NAV_TIMEOUT });
});

When('I create the role logins as assigned', async ({ page }) => {
  const modal = page.getByTestId('role-logins-modal');
  // Teams default to Responder.
  await modal.getByTestId('role-login-create-assigned').click();
});

Then('a new role login for {string} should be shown with its password', async ({ page }, unit: string) => {
  const card = page.getByTestId(`role-login-fresh-${unit}`);
  await expect(card).toBeVisible({ timeout: NAV_TIMEOUT });
  const username = (await card.getByTestId('role-login-username').innerText()).trim();
  const password = (await card.getByTestId('role-login-password').innerText()).trim();
  expect(username).toMatch(/^resp-[a-z0-9]{4}$/);
  expect(password).toHaveLength(10);
  fresh = { username, password };
  await expect(page.getByTestId(`role-login-row-${username}`)).toContainText('Active');
});

When('the new role login signs in on another device', async ({ page, browser }) => {
  if (!fresh) throw new Error('No role login was made');
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const otherPage = await context.newPage();
  other = { context, page: otherPage };
  const origin = new URL(page.url()).origin;
  await otherPage.goto(`${origin}/r/${fresh.username}#${encodeURIComponent(fresh.password)}`);
  await expect(otherPage).toHaveURL(/\/role$/, { timeout: NAV_TIMEOUT });
});

Then('the other device should show the Responder view for {string}', async ({}, unit: string) => {
  if (!other) throw new Error('No other device');
  await expect(other.page.getByTestId('role-view-responder')).toBeVisible({ timeout: NAV_TIMEOUT });
  await expect(other.page.getByTestId('role-title')).toHaveText(unit);
});

When('the other device picks zone {string} and submits {int} {string} after confirming', async ({}, zone: string, count: number, color: string) => {
  if (!other) throw new Error('No other device');
  const p = other.page;
  await p.getByTestId(`role-zone-${zone}`).click();
  const plus = p.getByTestId(`role-stepper-${color}`).getByRole('button', { name: /^Add one/ });
  for (let i = 0; i < count; i++) await plus.click();
  await expect(p.getByTestId('role-draft')).toBeVisible();
  await p.getByTestId('role-submit-counts').click();
  await expect(p.getByTestId('role-confirm')).toContainText(zone);
  await p.getByTestId('role-confirm-yes').click();
  await expect(p.getByTestId('role-draft')).toBeHidden({ timeout: NAV_TIMEOUT });
});

Then('the dispatch MCI log should show an entry by {string}', async ({ page }, unit: string) => {
  await page.getByTestId('role-login-close').click();
  await page.getByTestId('mci-log-toggle').click();
  await expect(page.getByTestId('mci-log-by').filter({ hasText: unit }).first()).toBeVisible({ timeout: NAV_TIMEOUT });
  await page.getByTestId('mci-role-logins').click();
});

When('I disable the new role login', async ({ page }) => {
  if (!fresh) throw new Error('No role login was made');
  await page.getByTestId(`role-login-toggle-${fresh.username}`).click();
  await expect(page.getByTestId(`role-login-row-${fresh.username}`)).toContainText('Disabled', { timeout: NAV_TIMEOUT });
});

Then('the other device should show that the login has been disabled', async () => {
  if (!other) throw new Error('No other device');
  await expect(other.page.getByTestId('role-disabled')).toBeVisible({ timeout: NAV_TIMEOUT });
});
