import type { Page } from '@playwright/test';
import { expect, test } from './extension';
import { activate, openSite, scan, setup } from './workday';

// Synthetic Greenhouse board (tests/fixtures/greenhouse/acme/jobs/1001.html), served for job-boards.greenhouse.io.
const ACME_GH = 'http://job-boards.greenhouse.io/acme/jobs/1001';

const values = (site: Page) => site.evaluate(() => ({
  inputs: [...document.querySelectorAll<HTMLInputElement>('form input:not([type=file]), form textarea')].map((e) => (e.type === 'checkbox' ? String(e.checked) : e.value)),
  shown: [...document.querySelectorAll('.select__single-value')].map((e) => e.textContent),
}));

async function ready(context: Parameters<typeof setup>[0], extensionId: string) {
  const admin = await setup(context, extensionId, (s) => { s.profile.contact.lastName = 'Example'; });
  const { site, tabId } = await openSite(context, admin, ACME_GH);
  let submitted = false;
  await site.exposeFunction('__submitted', () => { submitted = true; });
  await site.evaluate(() => document.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); (window as unknown as { __submitted: () => void }).__submitted(); }));
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  return { site, panel, submitted: () => submitted };
}

test('a Greenhouse scan reads the form without changing it', async ({ context, extensionId, consoleErrors }) => {
  const admin = await setup(context, extensionId);
  const { site, tabId } = await openSite(context, admin, ACME_GH);
  const before = await values(site);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('heading', { name: 'Application' })).toBeVisible();
  await expect(panel.getByTestId('count-recognized')).not.toHaveText('0');
  expect(await values(site)).toEqual(before);
  expect(consoleErrors).toEqual([]);
});

test('approved Greenhouse fields fill and verify, dropdowns included; Submit and the acknowledgement are never touched', async ({ context, extensionId }) => {
  const { site, panel, submitted } = await ready(context, extensionId);
  await panel.getByRole('button', { name: /^Approve all safe \(\d+\)$/ }).click();
  // An empty education block linked to your record is never "safe": approve its group explicitly.
  await panel.getByRole('group').filter({ has: panel.getByRole('checkbox', { name: 'Approve School' }) }).getByRole('button', { name: 'Approve all in this group' }).click();
  await panel.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  const results = panel.getByRole('region', { name: 'Fill results' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  for (const label of ['Last Name', 'Email', 'School', 'Degree', 'Discipline', 'End date month', 'End date year']) await expect(results).toContainText(`Filled and verified: ${label}`);
  await expect(site.locator('#last_name')).toHaveValue('Example');
  await expect(site.locator('#end-year--0')).toHaveValue('2025');
  const shown = (await values(site)).shown;
  expect(shown).toEqual(expect.arrayContaining(['Example State University', 'Computer Science', 'May']));
  // The acknowledgement dropdown keeps its placeholder, and nothing was submitted.
  await expect(site.locator('#question_104').locator('xpath=ancestor::div[contains(@class,"select__control")]').locator('.select__single-value')).toHaveCount(0);
  expect(submitted()).toBe(false);
});

test('a Greenhouse value the user typed after approving is never overwritten', async ({ context, extensionId }) => {
  const { site, panel } = await ready(context, extensionId);
  await panel.getByRole('button', { name: /^Approve all safe \(\d+\)$/ }).click();
  await site.locator('#last_name').fill('Typed By User');
  await panel.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Left as is: Last Name', { timeout: 30_000 });
  await expect(site.locator('#last_name')).toHaveValue('Typed By User');
});
