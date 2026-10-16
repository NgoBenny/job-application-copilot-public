import type { Page } from '@playwright/test';
import { expect, test } from './extension';
import { ACME, activate, HOOLI, openSite, pageState, scan, setup } from './workday';

const BASE = 'http://acme.wd1.myworkdayjobs.com/en-US/External';
const store = (admin: Page) => admin.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store);

test('single-page Next and Back trigger a fresh scan, and step names are recorded', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  const { site, tabId } = await openSite(context, admin, `${BASE}/apply/spa.html`);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('My Information');

  // Typing and rerenders on the same step never trigger a re-scan notice.
  await panel.evaluate(() => {
    (window as unknown as { __changes: number }).__changes = 0;
    chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'copilot/changed') (window as unknown as { __changes: number }).__changes++; });
  });
  await site.locator('#ln').fill('Typing here');
  await site.evaluate(() => document.getElementById('ln')!.setAttribute('data-rerendered', '1'));
  await site.waitForTimeout(1000);
  expect(await panel.evaluate(() => (window as unknown as { __changes: number }).__changes)).toBe(0);

  await site.evaluate(() => (window as unknown as { __goNext: () => void }).__goNext());
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('My Experience');
  await site.evaluate(() => (window as unknown as { __goBack: () => void }).__goBack());
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('My Information');
  // A step change without a URL change is noticed too.
  await site.evaluate(() => (window as unknown as { __goNextSameUrl: () => void }).__goNextSameUrl());
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('My Experience');

  await expect.poll(async () => (await store(admin)).applications.find((a: { id: string }) => a.id === 'app-acme').stepsSeen.map((s: { label: string }) => s.label))
    .toEqual(['My Information', 'My Experience', 'My Information', 'My Experience']);
});

test('sign-in and registration pages: passwords, codes and SSO are never read or written; registry changes only on your click', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  const { site, tabId } = await openSite(context, admin, `${BASE}/login.html`);
  await site.locator('#pw').fill('correct horse'); // the user's own typing, which must never be read
  const before = await pageState(site);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);

  const account = panel.getByRole('region', { name: 'Employer account' });
  await expect(account).toContainText('This is the sign-in page for this employer.');
  await expect(account).toContainText('sign-in with Google');
  await expect(panel.getByText('Nothing to change on this step from your profile.')).toBeVisible();
  await expect(panel.getByTestId('count-protected')).toHaveText('2');
  await expect(panel.locator('body')).not.toContainText('correct horse');

  const after = await pageState(site);
  expect(after.events).toEqual(before.events);
  expect(after.values).toEqual(before.values);
  const scanned = await admin.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'tab/scan', tabId: id }), tabId);
  expect(JSON.stringify(scanned)).not.toContain('correct horse');
  expect((await store(admin)).accounts).toEqual([]);

  await account.getByRole('button', { name: 'I have an account here' }).click();
  await expect(account).toContainText('you have an account here');
  const accounts = (await store(admin)).accounts;
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({ tenantKey: `${BASE.replace('/en-US', '')}`, email: 'avery@example.com', status: 'registered' });
  expect(JSON.stringify(accounts)).not.toContain('correct horse');

  // Create-account page: the agreement box is never touched.
  await site.goto(`${BASE}/create-account.html`);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel2 = await scan(context, extensionId, tabId);
  await expect(panel2.getByRole('region', { name: 'Employer account' })).toContainText('creates an account');
  await expect(panel2.getByTestId('count-protected')).toHaveText('4');
  await expect(site.locator('#agree')).not.toBeChecked();
  expect((await pageState(site)).events.filter((e) => /createAccountSubmitButton|signInSubmitButton/.test(e))).toEqual([]);
});

test('a confirmation page is recorded only after you confirm', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  const { tabId } = await openSite(context, admin, `${BASE}/apply/confirmation.html`);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('heading', { name: 'Looks like a confirmation page' })).toBeVisible();
  expect((await store(admin)).applications.find((a: { id: string }) => a.id === 'app-acme').submittedAt).toBe('');
  await panel.getByRole('button', { name: 'Yes, I submitted it' }).click();
  await expect(panel.getByText(/Recorded as submitted on/)).toBeVisible();
  expect((await store(admin)).applications.find((a: { id: string }) => a.id === 'app-acme').submittedAt).not.toBe('');
});

test('two tabs on two employers stay isolated, and a plan for one tab is refused by the other', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => { s.profile.contact.lastName = 'Example'; });
  const acme = await openSite(context, admin, ACME);
  const hooli = await openSite(context, admin, HOOLI);
  await activate(context, extensionId, acme.tabId, 'Acme Robotics');
  await activate(context, extensionId, hooli.tabId, 'Hooli');
  const hooliBefore = (await pageState(hooli.site)).values;

  const panelA = await scan(context, extensionId, acme.tabId);
  await panelA.getByRole('button', { name: /Approve all safe/ }).click();
  await panelA.getByRole('button', { name: /^Fill \d+ approved$/ }).click();
  await expect(panelA.getByRole('region', { name: 'Fill results' })).toBeVisible({ timeout: 15_000 });
  await expect(acme.site.locator('#ln')).toHaveValue('Example');
  expect((await pageState(hooli.site)).values).toEqual(hooliBefore);

  const forged = await admin.evaluate(async ({ tabId }) => chrome.runtime.sendMessage({
    type: 'tab/fill', tabId,
    plan: { planId: 'x', stepId: 'my-information', revision: 0, binding: { platformId: 'workday', portalOrigin: 'http://acme.wd1.myworkdayjobs.com', tenantKey: 'http://acme.wd1.myworkdayjobs.com/External', applicationId: 'app-acme' },
      actions: [{ actionId: 'a', type: 'set', fieldId: 'legalNameSection_firstName', kind: 'text', label: 'Given Name', expectedCurrent: '', proposed: 'Mallory', provenance: 'master', rationale: '' }] },
  }), { tabId: hooli.tabId });
  expect(forged).toMatchObject({ ok: false, error: expect.stringContaining('different application or portal') });
  await expect(hooli.site.locator('#fn')).toHaveValue('');

  const forgedSkills = await admin.evaluate(async ({ tabId }) => chrome.runtime.sendMessage({
    type: 'tab/skills', tabId,
    request: { binding: { platformId: 'workday', portalOrigin: 'http://acme.wd1.myworkdayjobs.com', tenantKey: 'http://acme.wd1.myworkdayjobs.com/External', applicationId: 'app-acme' }, fieldId: 'searchBox', items: [{ name: 'Python', spellings: ['Python'] }] },
  }), { tabId: hooli.tabId });
  expect(forgedSkills).toMatchObject({ ok: false, error: expect.stringContaining('not activated for this application') });
});

test('upload stays manual and names the right file', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.applications.find((a) => a.id === 'app-globex')!.imported = {
      source: 'pdf', resumeFilename: 'avery-globex.pdf', pdfFingerprint: '', candidate: { name: '', email: '', phone: '' }, links: [],
      education: [], experience: [], projects: [], skills: [], job: { company: '', title: '', url: '', description: '' }, warnings: [],
    };
  });
  const { site, tabId } = await openSite(context, admin, 'http://globex.wd5.myworkdayjobs.com/Careers/apply/my-experience.html');
  const before = await pageState(site);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('note')).toContainText('Upload avery-globex.pdf with the site\'s own upload button');
  expect((await pageState(site)).events).toEqual(before.events);
});
