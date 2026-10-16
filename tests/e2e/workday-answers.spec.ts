import { expect, test } from './extension';
import { activate, INITECH, openSite, pageState, scan, setup } from './workday';

test('saved answers reuse safely; sensitive answers need per-field approval; only explicit Remember saves', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.answers = [
      { id: 'm1', question: 'Are you willing to relocate?', kind: 'choice', answer: 'Yes', options: ['Yes', 'No'], scope: 'global', tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'm2', question: 'Desired salary', kind: 'text', answer: '95k', options: [], scope: 'employer', tenantKey: 'http://acme.wd1.myworkdayjobs.com/External', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
    ];
    s.sensitiveAnswers = [{ topic: 'sponsorship', answer: 'No' }, { topic: 'authorizedToWork', answer: 'Yes' }, { topic: 'gender', answer: 'Female' }];
  });
  const { site, tabId } = await openSite(context, admin, INITECH);
  await activate(context, extensionId, tabId, 'Initech');
  const panel = await scan(context, extensionId, tabId);

  // Only the ordinary saved choice is "safe"; Acme's salary answer isn't offered at Initech.
  await expect(panel.getByRole('checkbox', { name: 'Approve Desired salary' })).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: 'Approve Please select' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Approve all safe (1)' }).click();
  await expect(panel.getByRole('checkbox', { name: 'Approve Will you now or in the future require visa sponsorship?' })).not.toBeChecked();
  await panel.getByRole('button', { name: 'Fill 1 approved' }).click();
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Filled and verified: Are you willing to relocate?');
  await expect(site.locator('#relo')).toHaveValue('Yes');
  await expect(site.locator('#sp')).toHaveValue('');

  // A sensitive answer fills only after its own approval.
  await panel.getByRole('checkbox', { name: 'Approve Will you now or in the future require visa sponsorship?' }).check();
  await panel.getByRole('button', { name: 'Fill 1 approved' }).click();
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Filled and verified: Will you now or in the future require visa sponsorship?');
  await expect(site.locator('#sp')).toHaveValue('No');
  await expect(site.locator('#g')).toHaveValue('');
  await expect(site.locator('#terms')).not.toBeChecked();

  const count = async () => (await admin.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store.answers.length)) as number;
  expect(await count()).toBe(2); // filling never creates memories

  // Explicit Remember, scoped to this employer.
  await site.locator('#sal').fill('120k');
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  await panel.getByText('Remember answers you typed').click();
  await expect(panel.getByRole('list', { name: 'Answers you can remember' })).not.toContainText('sponsorship');
  await panel.getByLabel('Where to reuse Desired salary').selectOption('employer');
  await panel.getByRole('button', { name: 'Remember Desired salary' }).click();
  await expect(panel.getByRole('list', { name: 'Answers you can remember' })).toContainText('Saved');
  const saved = await admin.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store.answers);
  expect(saved.find((m: { answer: string }) => m.answer === '120k')).toMatchObject({ question: 'Desired salary', scope: 'employer', tenantKey: 'http://wd3.myworkdaysite.com/recruiting/initech/Careers' });

  // The dashboard lists it and can delete it.
  await admin.reload();
  await admin.getByRole('button', { name: 'Saved answers' }).click();
  await admin.getByRole('button', { name: 'Delete saved answer: Desired salary' }).first().click();
  await expect(admin.getByRole('status')).toHaveText('Answer deleted.');
  expect((await pageState(site)).navigated).toBe(false);
});
