import { expect, test } from './extension';
import { activate, GLOBEX, openSite, scan, setup } from './workday';

// Regenerate README screenshots (fabricated data only): SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to regenerate docs/screenshots');

test('capture screenshots', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.profile.employment.push({ id: 'emp-2', employer: 'Globex Corporation', title: 'Data Analyst', location: '', start: '2025-01', end: '', current: true, bullets: [] });
  });
  await admin.setViewportSize({ width: 1000, height: 760 });
  await admin.reload();
  await admin.screenshot({ path: 'docs/screenshots/dashboard.png' });

  const { tabId } = await openSite(context, admin, GLOBEX);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);
  await panel.setViewportSize({ width: 380, height: 900 });
  await expect(panel.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
  await panel.screenshot({ path: 'docs/screenshots/step-review.png' });
  await panel.getByRole('heading', { name: 'Proposed changes' }).scrollIntoViewIfNeeded();
  await panel.getByRole('button', { name: /Approve all safe/ }).click();
  await panel.screenshot({ path: 'docs/screenshots/proposals.png' });
});
