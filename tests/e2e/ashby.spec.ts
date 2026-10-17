import type { Page } from '@playwright/test';
import { expect, test } from './extension';
import { activate, openSite, scan, setup } from './workday';

// Synthetic Ashby form (tests/fixtures/ashby/acme/<job>/application.html), served for jobs.ashbyhq.com.
const ACME_ASHBY = 'https://jobs.ashbyhq.com/acme/0f1e2d3c-0000-4000-8000-000000000001/application';

const values = (site: Page) => site.evaluate(() => ({
  inputs: [...document.querySelectorAll<HTMLInputElement>('.ashby-application-form-field-entry input:not([type=file]), .ashby-application-form-field-entry textarea')].map((e) => (e.type === 'checkbox' || e.type === 'radio' ? String(e.checked) : e.value)),
  pressed: [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent),
}));

async function ready(context: Parameters<typeof setup>[0], extensionId: string) {
  const admin = await setup(context, extensionId, (s) => { s.profile.contact.lastName = 'Example'; });
  const { site, tabId } = await openSite(context, admin, ACME_ASHBY);
  let submitClicks = 0;
  await site.exposeFunction('__submitClicked', () => { submitClicks++; });
  await site.evaluate(() => document.querySelector('.ashby-application-form-submit-button')!.addEventListener('click', () => (window as unknown as { __submitClicked: () => void }).__submitClicked()));
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  return { site, panel, submitClicks: () => submitClicks };
}

test('an Ashby scan reads the form without changing it', async ({ context, extensionId, consoleErrors }) => {
  const admin = await setup(context, extensionId);
  const { site, tabId } = await openSite(context, admin, ACME_ASHBY);
  const before = await values(site);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('heading', { name: 'Application' })).toBeVisible();
  await expect(panel.getByTestId('count-recognized')).not.toHaveText('0');
  expect(await values(site)).toEqual(before);
  expect(consoleErrors).toEqual([]);
});

test('approved Ashby fields fill and verify; Submit Application is never pressed', async ({ context, extensionId }) => {
  const { site, panel, submitClicks } = await ready(context, extensionId);
  await panel.getByRole('button', { name: /^Approve all safe \(\d+\)$/ }).click();
  await panel.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  const results = panel.getByRole('region', { name: 'Fill results' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  for (const label of ['Name', 'Email']) await expect(results).toContainText(`Filled and verified: ${label}`);
  await expect(site.locator('#_systemfield_name')).toHaveValue(/ Example$/);
  expect(submitClicks()).toBe(0);
});

test('an Ashby value the user typed after approving is never overwritten', async ({ context, extensionId }) => {
  const { site, panel } = await ready(context, extensionId);
  await panel.getByRole('button', { name: /^Approve all safe \(\d+\)$/ }).click();
  await site.locator('#_systemfield_email').fill('typed@example.com');
  await panel.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Left as is: Email', { timeout: 30_000 });
  await expect(site.locator('#_systemfield_email')).toHaveValue('typed@example.com');
});
