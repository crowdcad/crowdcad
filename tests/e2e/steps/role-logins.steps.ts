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

When('I create a role login for the default role', async ({ page }) => {
  const modal = page.getByTestId('role-logins-modal');
  await modal.getByTestId('role-login-create').click();
  await expect(modal.getByTestId('role-login-fresh-treatment')).toBeVisible({ timeout: NAV_TIMEOUT });
});

Then('the new role login should be shown with its password', async ({ page }) => {
  const card = page.getByTestId('role-login-fresh-treatment');
  const username = (await card.getByTestId('role-login-username').innerText()).trim();
  const password = (await card.getByTestId('role-login-password').innerText()).trim();
  expect(username).toMatch(/^treat-[a-z0-9]{4}$/);
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

Then('the other device should show the {string} role', async ({}, role: string) => {
  if (!other) throw new Error('No other device');
  await expect(other.page.getByTestId('role-landing')).toContainText(role, { timeout: NAV_TIMEOUT });
  await expect(other.page.getByTestId('role-active')).toBeVisible();
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
