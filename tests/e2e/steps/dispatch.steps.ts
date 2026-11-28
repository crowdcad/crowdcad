import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures';
import { createEventAndOpenDispatch } from '../helpers/create-event';

const { Given, When, Then } = createBdd(test);

Given('I have created an event and am on the dispatch page', async ({ page }) => {
  await createEventAndOpenDispatch(page);
});

Then('I should see the teams section', async ({ page }) => {
  // The left sidebar defaults to "Teams" view; with no teams added, this message shows
  await expect(page.getByText('No teams available')).toBeVisible();
});

// Named locator avoids a strict-mode clash with the Location field's own
// Autocomplete popover, which also carries role="dialog" and opens
// immediately (it autofocuses on a fresh call) alongside the modal itself.
When('I open the quick call modal', async ({ page }) => {
  await page.getByTestId('add-call-button').click();
  await expect(page.getByRole('dialog', { name: 'Add Call' })).toBeVisible();
});

When('I log a call with location {string} and complaint {string}', async ({ page, scenarioState }, location: string, complaint: string) => {
  scenarioState.loggedCallLocation = location;
  const dialog = page.getByRole('dialog', { name: 'Add Call' });
  await dialog.getByLabel('Location').fill(location);
  await dialog.getByLabel('Chief Complaint').fill(complaint);
  await dialog.getByRole('button', { name: 'Submit' }).click();
});

Then('the call should appear in the call list', async ({ page, scenarioState }) => {
  await expect(page.getByText(scenarioState.loggedCallLocation)).toBeVisible();
});

Then('I should see the text {string} in the calls table', async ({ page }, text: string) => {
  // Scoped to the calls <table> so a plain getByText doesn't clash with the
  // same word appearing in the stat row above it (e.g. "Pending" is both a
  // call's status chip and one of the Calls tab's insight labels).
  await expect(page.locator('table').getByText(text)).toBeVisible();
});

// Team management

When('I open the add team modal', async ({ page }) => {
  // Two buttons share this aria-label (condensed header + Staff tab); .first() picks either
  await page.getByRole('button', { name: 'Add Team or Supervisor' }).first().click();
  await page.getByRole('menuitem', { name: 'Add Team' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

When('I create a team named {string} with a member {string} certified as {string}', async ({ page }, teamName: string, memberName: string, cert: string) => {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Team name').fill(teamName);
  await dialog.getByLabel('Member name').fill(memberName);
  await dialog.locator('[aria-label="Certification"]').click();
  // HeroUI SelectItem's aria-label lands on an inner wrapper, leaving the <li role="option">
  // with no accessible name — use getByText within the listbox instead
  await page.locator('[role="listbox"]').getByText(cert, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save & close' }).click();
  // Named locator avoids a strict-mode clash with the Certification Select's
  // own popover, which also carries role="dialog" and can briefly linger in
  // the DOM mid-unmount after the parent modal closes.
  await expect(page.getByRole('dialog', { name: 'Add New Team' })).not.toBeVisible();
});

Then('the team {string} should appear in the teams list', async ({ page }, teamName: string) => {
  // Team name can appear in multiple panels (condensed view + Staff tab); .first() is sufficient
  await expect(page.getByText(teamName).first()).toBeVisible();
});

Then('the team {string} should have status {string}', async ({ page }, teamName: string, status: string) => {
  const card = page.getByTestId(`team-card-${teamName}`);
  // HeroUI Select renders two [data-slot="value"] spans per Select (trigger + hidden a11y copy);
  // .first() targets the visible trigger span
  await expect(card.locator('[aria-label="Status"] [data-slot="value"]').first()).toHaveText(status);
});

// Call with team assignment

When('I log a call assigned to team {string} at location {string} with complaint {string}', async ({ page, scenarioState }, teamName: string, location: string, complaint: string) => {
  scenarioState.loggedCallLocation = location;
  const dialog = page.getByRole('dialog', { name: 'Add Call' });
  await dialog.getByLabel('Location').fill(location);
  await dialog.getByLabel('Chief Complaint').fill(complaint);
  await dialog.locator('[aria-label="Assign Team"]').click();
  // Option text is "{teamName} - {location}" — match by partial text to handle any location suffix
  await page.locator('[role="listbox"]').getByText(teamName).click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
});

// Quick call modal cancel

When('I fill the quick call location with {string}', async ({ page }, text: string) => {
  const dialog = page.getByRole('dialog', { name: 'Add Call' });
  await dialog.getByLabel('Location').fill(text);
  // Blurs the field so the Autocomplete's own suggestion popover (open from
  // the fill above) closes before the next interaction — otherwise it can
  // still be sitting over later controls in the modal (e.g. the Cancel
  // button) since nothing else in this flow moves focus away first.
  await dialog.getByText('Add Call', { exact: true }).click();
});

When('I cancel the quick call modal', async ({ page }) => {
  await page.getByRole('dialog', { name: 'Add Call' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Add Call' })).not.toBeVisible({ timeout: 5_000 });
});

Then('the quick call location field should be empty', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: 'Add Call' }).getByLabel('Location')).toHaveValue('');
});

// Event summary modal

When('I open the event summary modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Event Summary' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

When('I close the event summary modal', async ({ page }) => {
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

Then('the event summary modal should be closed', async ({ page }) => {
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
});

// Section switching

When('I switch to the {string} section', async ({ page }, section: string) => {
  // "Clinic", "Calls", and "Staff" are bottom-bar tabs in the mobile layout (lg:hidden).
  // On desktop viewports the mobile tab bar is hidden and these sections are selected via the right-side tab buttons.
  // "Teams", "Supervisors", "Equipment" live in the left-panel Select dropdown on desktop.
  const bottomTabs = ['Staff', 'Calls', 'Clinic'];
  if (bottomTabs.includes(section)) {
    const tab = page.getByRole('tab', { name: section });
    if (await tab.isVisible()) {
      await tab.click();
    } else {
      // Desktop view: Calls/Clinic are tab buttons in the right-side pane
      const button = page.getByRole('button', { name: new RegExp(`^${section}`) });
      if (await button.isVisible()) {
        await button.click();
      }
    }
  } else {
    await page.locator('[aria-label="Select section"]').click();
    await page.getByRole('option', { name: section }).click();
  }
});

When('I search the Log view for {string}', async ({ page }, query: string) => {
  await page.locator('[aria-label="Select section"]').click();
  await page.getByRole('option', { name: 'Log', exact: true }).click();
  await page.getByTestId('event-log-search').fill(query);
});

Then('the Log view should show {string} from {string}', async ({ page }, text: string, source: string) => {
  await expect(page.getByTestId('event-log-row').filter({ hasText: source }).filter({ hasText: text }).first()).toBeVisible();
});

// Supervisor management

When('I open the add supervisor modal', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Team or Supervisor' }).first().click();
  await page.getByRole('menuitem', { name: 'Add Supervisor' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

When('I create a supervisor with call sign {string} and certification {string}', async ({ page }, callSign: string, cert: string) => {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Supervisor Call Sign').fill(callSign);
  await dialog.locator('[aria-label="Certification"]').click();
  await page.locator('[role="listbox"]').getByText(cert, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save & close' }).click();
  // Named locator avoids a strict-mode clash with the Certification Select's
  // own popover, which also carries role="dialog" and can briefly linger in
  // the DOM mid-unmount after the parent modal closes.
  await expect(page.getByRole('dialog', { name: 'Add New Supervisor' })).not.toBeVisible();
});

Then('the supervisor {string} should appear in the supervisors list', async ({ page }, callSign: string) => {
  // Call sign appears in both the condensed panel and the Staff tab panel; .first() is sufficient
  await expect(page.getByText(callSign).first()).toBeVisible();
});

// Team status changes within a call

When('I change team {string} status on the call to {string}', async ({ page }, teamName: string, newStatus: string) => {
  await page.getByTestId(`team-chip-${teamName}`).locator('button').first().click();
  await page.getByRole('menuitem', { name: newStatus }).click();
});

// Team deletion

When('I delete the team {string}', async ({ page }, teamName: string) => {
  const card = page.getByTestId(`team-card-${teamName}`);
  await card.getByRole('button', { name: 'Team actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
});

Then('the team {string} should not be visible', async ({ page }, teamName: string) => {
  await expect(page.getByText(teamName).first()).not.toBeVisible({ timeout: 5_000 });
});

// Supervisor deletion

When('I delete the supervisor {string}', async ({ page }, callSign: string) => {
  // Supervisors render via TeamWidget with the same data-testid pattern as teams
  const card = page.getByTestId(`team-card-${callSign}`);
  await card.getByRole('button', { name: 'Team actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
});

