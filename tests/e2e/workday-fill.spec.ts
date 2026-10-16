import type { Page } from '@playwright/test';
import { expect, test } from './extension';
import { ACME, activate, GLOBEX, openSite, pageState, scan, setup } from './workday';

const withContact = (s: Parameters<NonNullable<Parameters<typeof setup>[2]>>[0]) => {
  s.profile.contact.lastName = 'Example';
  s.profile.links.push({ id: 'link-2', kind: 'linkedin', label: '', url: 'https://linkedin.com/in/avery-example' });
};

async function fillApproved(panel: Page) {
  await panel.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  await expect(panel.getByRole('region', { name: 'Fill results' })).toBeVisible({ timeout: 15_000 });
}

test('safe fields fill, survive rerenders, verify, and a second run is a no-op', async ({ context, extensionId, consoleErrors }) => {
  const admin = await setup(context, extensionId, withContact);
  const { site, tabId } = await openSite(context, admin, ACME);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);

  const before = (await pageState(site)).values;
  await panel.getByRole('button', { name: 'Approve all safe (4)' }).click();
  await fillApproved(panel);
  // Zero wrong-field writes: only the four approved inputs (#ln, #ph, #ci, #li) changed.
  const ids = await site.evaluate(() => [...document.querySelectorAll('input, textarea, select')].map((el) => el.id));
  const after = (await pageState(site)).values;
  expect(ids.filter((_, i) => after[i] !== before[i]).sort()).toEqual(['ci', 'li', 'ln', 'ph']);
  const results = panel.getByRole('region', { name: 'Fill results' });
  for (const label of ['Last Name', 'Phone Number', 'City', 'LinkedIn']) await expect(results).toContainText(`Filled and verified: ${label}`);

  await expect(site.locator('#ln')).toHaveValue('Example');
  await expect(site.locator('#ph')).toHaveValue('555-0100');
  await expect(site.locator('#ci')).toHaveValue('Springfield');
  await expect(site.locator('#li')).toHaveValue('https://linkedin.com/in/avery-example');
  const state = await pageState(site);
  expect(await site.evaluate(() => (window as unknown as { __copilot: { rerenders: number } }).__copilot.rerenders)).toBeGreaterThanOrEqual(4);
  expect(state.navigated).toBe(false);
  expect(state.events.filter((e) => /bottom-navigation|submit/.test(e))).toEqual([]);

  // Idempotent: scanning again finds nothing left to change.
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  await expect(panel.getByText('Nothing to change on this step from your profile.')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('a value the user typed after approving is never overwritten', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, withContact);
  const { site, tabId } = await openSite(context, admin, ACME);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  await panel.getByRole('button', { name: 'Approve all safe (4)' }).click();

  await site.locator('#ci').fill('Shelbyville'); // the user edits the page before pressing Fill
  await fillApproved(panel);
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Left as is: City');
  await expect(site.locator('#ci')).toHaveValue('Shelbyville');
  await expect(site.locator('#ln')).toHaveValue('Example');
});

test('only approved fields are written; an existing value needs explicit approval', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => { withContact(s); s.profile.contact.firstName = 'Avery-Jo'; });
  const { site, tabId } = await openSite(context, admin, ACME);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);

  // "First Name" already has a value on the page: it is offered, but never as safe.
  await panel.getByRole('button', { name: 'Approve all safe (4)' }).click();
  await expect(panel.getByRole('checkbox', { name: 'Approve First Name' })).not.toBeChecked();
  for (const name of ['Last Name', 'City', 'LinkedIn']) await panel.getByRole('checkbox', { name: `Approve ${name}` }).uncheck();
  await panel.getByRole('checkbox', { name: 'Approve Phone Number' }).check();
  await fillApproved(panel);
  await expect(site.locator('#ph')).toHaveValue('555-0100');
  await expect(site.locator('#ln')).toHaveValue('');
  await expect(site.locator('#fn')).toHaveValue('Avery');

  await panel.getByRole('checkbox', { name: 'Approve First Name' }).check();
  await fillApproved(panel);
  await expect(site.locator('#fn')).toHaveValue('Avery-Jo');
});

test('My Experience repair: dates and dropdowns by record identity, plus a bounded Add Another', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.profile.employment.push({ id: 'emp-2', employer: 'Globex Corporation', title: 'Data Analyst', location: '', start: '2025-01', end: '', current: true, bullets: [] });
  });
  const { site, tabId } = await openSite(context, admin, GLOBEX);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);

  const entries = panel.getByRole('region', { name: 'Entries on this page' });
  await expect(entries).toContainText('Teaching Assistant at Example State');
  await expect(entries).toContainText('Not found in your master profile.');

  await panel.getByRole('button', { name: 'Approve all safe (2)' }).click();
  await panel.getByRole('checkbox', { name: /Approve Add work experience: Data Analyst at Globex Corporation/ }).check();
  await fillApproved(panel);
  const results = panel.getByRole('region', { name: 'Fill results' });
  await expect(results).toContainText('Filled and verified: To');
  await expect(results).toContainText('Filled and verified: Degree');
  await expect(results).toContainText('Filled and verified: Add work experience');
  await expect(site.locator('[data-automation-id="formField-degree"] button')).toHaveText('Bachelor of Science (BS)');
  await expect(site.locator('[data-automation-id="formField-endDate"] [data-automation-id="dateSectionMonth-input"]')).toHaveValue('08');
  await expect(site.locator('[data-automation-id="formField-endDate"] [data-automation-id="dateSectionYear-input"]')).toHaveValue('2024');
  await expect(site.getByRole('heading', { name: 'Work Experience 3' })).toBeVisible();
  // The unmatched Teaching Assistant entry was never touched.
  await expect(site.locator('#we2-title')).toHaveValue('Teaching Assistant');

  // The new empty entry is paired with the missing record, for review only (never "safe").
  const group = panel.getByRole('group', { name: 'New empty record' });
  await expect(group).toContainText('Globex Corporation');
  await expect(panel.getByRole('button', { name: 'Approve all safe (0)' })).toBeDisabled();
  await group.getByRole('button', { name: 'Approve all in this group' }).click();
  await fillApproved(panel);
  await expect(site.locator('#we3-title')).toHaveValue('Data Analyst');
  await expect(site.locator('#we3-co')).toHaveValue('Globex Corporation');
  const state = await pageState(site);
  expect(state.navigated).toBe(false);
  expect(state.events.filter((e) => /bottom-navigation|submit/.test(e))).toEqual([]);
});
