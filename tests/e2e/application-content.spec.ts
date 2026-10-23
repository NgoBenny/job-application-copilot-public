import { readFileSync } from 'node:fs';
import { expect, test } from './extension';
import { activate, GLOBEX, openSite, scan, setup } from './workday';

test('reviewed application wording fills the selected job and stays separate from master facts', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.profile.employment.push({ ...s.profile.employment[0]!, id: 'emp-2', employer: 'Other Company', title: 'Engineer' });
    s.profile.projects.push({ id: 'project-1', name: 'Route Planner', url: '', description: 'Verified project description', bullets: [] });
  });
  await admin.getByRole('button', { name: 'Applications', exact: true }).click();
  await admin.getByRole('navigation', { name: 'Applications' }).getByRole('button', { name: /^Globex/ }).click();
  const imported = JSON.parse(readFileSync('examples/tailored-resume.example.json', 'utf8'));
  imported.experience[0].bullets.push('Documented the verified test workflow');
  await admin.getByLabel('Companion JSON').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await admin.getByRole('button', { name: 'Read resume files' }).click();
  await expect(admin.getByRole('status').last()).toContainText('Resume imported');
  await admin.getByLabel('Choose records and wording for this application').check();
  await admin.getByLabel('Include education:').uncheck();
  await admin.getByLabel('Include employment: Engineer at Other Company').uncheck();
  await admin.getByText('Imported wording for employment: Software Engineering Intern at Acme Robotics', { exact: true }).click();
  await admin.getByRole('button', { name: 'Use imported wording for employment:' }).click();
  await admin.getByText('Imported wording for project: Route Planner', { exact: true }).click();
  await admin.getByRole('button', { name: 'Use imported wording for project:' }).click();
  await admin.getByLabel('I verified the selected records and wording').check();
  await admin.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(admin.getByRole('status').last()).toHaveText('Saved.');
  if (process.env.SCREENSHOTS) {
    await admin.getByRole('heading', { name: 'Application content', exact: true }).scrollIntoViewIfNeeded();
    await admin.screenshot({ path: 'docs/screenshots/application-content.png', fullPage: true });
  }

  const { site, tabId } = await openSite(context, admin, GLOBEX);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);
  await expect(panel.getByRole('checkbox', { name: 'Approve Degree', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: /Approve Add work experience: Engineer at Other Company/ })).toHaveCount(0);
  const description = panel.getByRole('checkbox', { name: 'Approve Role Description', exact: true });
  await expect(description).toBeVisible();
  await panel.getByRole('button', { name: /Approve all safe/ }).click();
  await expect(description).not.toBeChecked();
  await description.check();
  await panel.getByRole('button', { name: /Fill \d+ approved/ }).click();
  const wording = imported.experience[0].bullets.join('\n');
  await expect(site.locator('#we1-d')).toHaveValue(wording);
  await expect(site.locator('#we1-title')).toHaveValue('Software Engineering Intern');
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Filled and verified: Role Description');
  await expect(description).toHaveCount(0);
  await panel.getByText('Approved project wording (manual entry)', { exact: true }).click();
  await expect(panel.getByText('Graph search visualizer\nWritten in Rust', { exact: true })).toBeVisible();
  const store = await admin.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store);
  expect(store.profile.employment[0].bullets).toEqual(['Built a test harness']);
  expect(store.profile.projects[0].description).toBe('Verified project description');
  expect(store.applications.find((a: { id: string }) => a.id === 'app-acme').content).toBeUndefined();

  // Every wording change invalidates approval until the user checks it again.
  await admin.getByLabel('Wording for employment:').fill('Edited draft needing review');
  await expect(admin.getByLabel('I verified the selected records and wording')).not.toBeChecked();
  await admin.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(admin.getByRole('status').last()).toHaveText('Saved.');
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  await expect(panel.getByRole('list', { name: 'Review notes' })).toContainText('Review and approve');
  await expect(panel.getByRole('checkbox', { name: 'Approve Role Description', exact: true })).toHaveCount(0);

  await admin.getByLabel('I verified the selected records and wording').check();
  await admin.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(admin.getByRole('status').last()).toHaveText('Saved.');
  admin.once('dialog', (dialog) => void dialog.accept());
  await admin.getByRole('button', { name: 'Read resume files' }).click();
  await expect(admin.getByRole('status').last()).toContainText('Resume imported');
  await expect(admin.getByLabel('I verified the selected records and wording')).not.toBeChecked();
  await admin.getByLabel('Choose records and wording for this application').uncheck();
  await admin.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(admin.getByRole('status').last()).toHaveText('Saved.');
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  await expect(panel.getByRole('checkbox', { name: 'Approve Role Description', exact: true })).toBeVisible();
});
