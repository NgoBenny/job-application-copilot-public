import type { Application } from '../../src/domain/schemas';
import { expect, FIXTURES, test } from './extension';
import { ACME, activate, GLOBEX, HOOLI, INITECH, LISTING, openSite, pageState, scan, setup } from './workday';

for (const [url, employer, step, counts] of [
  [ACME, 'Acme Robotics', 'My Information', { recognized: 7, missing: 1 }],
  [GLOBEX, 'Globex', 'My Experience', { protected: 0, unsupported: 1 }],
  [INITECH, 'Initech', 'Application Questions', { protected: 5, missing: 1 }],
] as const) {
  test(`scan of ${employer} is read-only: zero writes, zero clicks`, async ({ context, extensionId, consoleErrors }) => {
    const admin = await setup(context, extensionId);
    const { site, tabId } = await openSite(context, admin, url);
    const before = await pageState(site);

    const popup = await activate(context, extensionId, tabId, employer);
    await expect(popup.getByRole('status')).toContainText(`Active on this tab for ${employer}`);
    const panel = await scan(context, extensionId, tabId);
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(step);
    await expect(panel.getByText('Scanning never changes the page.')).toBeVisible();
    for (const [k, n] of Object.entries(counts)) await expect(panel.getByTestId(`count-${k}`)).toHaveText(String(n));

    const after = await pageState(site);
    expect(after.events).toEqual([]);
    expect(after.mutations).toBe(before.mutations);
    expect(after.values).toEqual(before.values);
    expect(after.navigated).toBe(false);
    expect(consoleErrors).toEqual([]);
  });
}

test('pages that are not recognized application steps stay inactive', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  for (const [url, message] of [[LISTING, "isn't recognized as an application form"], [`${FIXTURES}/lookalike.html`, 'not a supported application site']] as const) {
    const { tabId } = await openSite(context, admin, url);
    const popup = await activate(context, extensionId, tabId, 'Acme Robotics');
    await expect(popup.getByRole('alert')).toContainText(message);
    await expect(popup.getByRole('status')).toHaveText('Not active on this tab.');
    const panel = await scan(context, extensionId, tabId);
    await expect(panel.getByRole('alert')).toContainText('not activated');
  }
});

test('two employers on the same Workday host stay separate', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  const initech = await openSite(context, admin, INITECH);
  await activate(context, extensionId, initech.tabId, 'Initech');
  const hooli = await openSite(context, admin, HOOLI);

  // The Initech application is now tied to Initech's portal and can't be used on Hooli's.
  const wrong = await activate(context, extensionId, hooli.tabId, 'Initech');
  await expect(wrong.getByRole('alert')).toContainText('belongs to a different employer portal');
  await expect((await scan(context, extensionId, hooli.tabId)).getByRole('alert')).toContainText('not activated');

  const right = await activate(context, extensionId, hooli.tabId, 'Hooli');
  await expect(right.getByRole('status')).toContainText('Active on this tab for Hooli');
  const keys = await admin.evaluate(async () => {
    const r = await chrome.runtime.sendMessage({ type: 'store/get' });
    return Object.fromEntries(r.store.applications.map((a: Application) => [a.employerLabel, a.tenantKey]));
  });
  expect(keys.Initech).toBe('http://wd3.myworkdaysite.com/recruiting/initech/Careers');
  expect(keys.Hooli).toBe('http://wd3.myworkdaysite.com/recruiting/hooli/Careers');
});

test('a binding ends when the tab moves to another origin', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  const { site, tabId } = await openSite(context, admin, ACME);
  await activate(context, extensionId, tabId, 'Acme Robotics');
  await site.goto(`${FIXTURES}/index.html`);
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('alert')).toContainText(/not activated|Activate again/);
});
