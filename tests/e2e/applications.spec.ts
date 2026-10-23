import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { sampleStore } from '../fixtures/data/profile';
import { expect, test } from './extension';

const PDF = 'tests/fixtures/pdf';
const exampleJson = readFileSync('examples/tailored-resume.example.json', 'utf8');

async function openApplications(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // Seed a fabricated master profile through the same validated import path the UI uses.
  await page.evaluate(async (text) => chrome.runtime.sendMessage({ type: 'store/import', text }), JSON.stringify(sampleStore()));
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
}

async function newApp(page: Page) {
  await page.getByRole('button', { name: 'New application' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Untitled employer');
}

test('PDF-only import produces a reviewed application', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByLabel('Resume PDF').setInputFiles(`${PDF}/avery-acme-swe.pdf`);
  await page.getByRole('button', { name: 'Read resume files' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Resume imported. Review it below, then save.');
  const employment = page.getByRole('region', { name: 'Employment' });
  await expect(employment.getByText('Software Engineering Intern at Acme Robotics')).toBeVisible();
  await expect(employment.getByText('Matches your master profile.')).toBeVisible();
  await expect(employment.getByText('Not matched to your master profile.')).toBeVisible(); // the TA role
  await expect(page.getByRole('region', { name: 'Education' }).getByRole('table')).toContainText('Bachelor of Science');
  await page.getByRole('textbox', { name: 'Employer', exact: true }).fill('Acme Robotics');
  await page.getByLabel('I reviewed this import').check();
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Saved.');
  await page.reload();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Applications' })).toContainText('Reviewed · PDF');
});

test('JSON-only import fills the job details', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByLabel('Companion JSON').setInputFiles({ name: 'avery-acme-swe.json', mimeType: 'application/json', buffer: Buffer.from(exampleJson) });
  await page.getByRole('button', { name: 'Read resume files' }).click();
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('Acme Robotics');
  await expect(page.getByLabel('Job title')).toHaveValue('Software Engineer I');
  await expect(page.getByText('Imported from JSON')).toBeVisible();
});

test('a mismatched PDF + JSON pair is flagged', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  const other = { ...JSON.parse(exampleJson), resume: { filename: 'jordan-globex.pdf' }, candidate: { firstName: 'Jordan', lastName: 'Sample' }, experience: [{ employer: 'Globex Corporation', title: 'Data Analyst' }] };
  await page.getByLabel('Resume PDF').setInputFiles(`${PDF}/avery-acme-swe.pdf`);
  await page.getByLabel('Companion JSON').setInputFiles({ name: 'jordan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) });
  await page.getByRole('button', { name: 'Read resume files' }).click();
  const warnings = page.getByRole('list', { name: 'Import warnings' });
  await expect(warnings).toContainText('may be for different jobs');
  await expect(warnings).toContainText('name in the JSON does not match');
  await expect(warnings).toContainText('not found in the PDF text');
});

for (const [file, message] of [
  ['encrypted.pdf', 'password-protected'],
  ['image-only.pdf', 'No text was found'],
  ['corrupt.pdf', 'not a readable PDF'],
] as const) {
  test(`${file} is reported clearly`, async ({ context, extensionId, consoleErrors }) => {
    const page = await context.newPage();
    await openApplications(page, extensionId);
    await newApp(page);
    await page.getByLabel('Resume PDF').setInputFiles(`${PDF}/${file}`);
    await page.getByRole('button', { name: 'Read resume files' }).click();
    await expect(page.getByRole('status').last()).toContainText(message);
    await expect(page.getByRole('region', { name: 'Employment' })).toHaveCount(0);
    expect(consoleErrors.filter((e) => !/Warning:|PasswordException|InvalidPDF/.test(e))).toEqual([]);
  });
}

test('switching applications never leaks data between them', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByRole('textbox', { name: 'Employer', exact: true }).fill('Acme Robotics');
  await page.getByLabel('Paste the job description').fill('JD for Acme');
  await page.getByLabel('Save the job description').check();
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Saved.');

  await newApp(page);
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('');
  await expect(page.getByLabel('Paste the job description')).toHaveValue('');
  await page.getByRole('textbox', { name: 'Employer', exact: true }).fill('Globex');
  await page.getByLabel('Paste the job description').fill('JD for Globex, not saved');
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Saved.');

  const nav = page.getByRole('navigation', { name: 'Applications' });
  await nav.getByRole('button', { name: /Acme Robotics/ }).click();
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('Acme Robotics');
  await expect(page.getByLabel('Paste the job description')).toHaveValue('JD for Acme');
  await nav.getByRole('button', { name: /Globex/ }).click();
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('Globex');
  // Not opted in: the job description was never stored.
  await expect(page.getByLabel('Paste the job description')).toHaveValue('');
});

test('an application can be marked as submitted by hand, and saving keeps it (live QA 2026-10-11)', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByRole('textbox', { name: 'Employer', exact: true }).fill('Acme Robotics');
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Saved.');

  await page.getByRole('button', { name: 'Mark as submitted' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Marked as submitted.');
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.getByText(`Submitted on ${today}.`)).toBeVisible();
  // Saving the rest of the application afterwards keeps the date.
  await page.getByRole('button', { name: 'Save application' }).click();
  await expect(page.getByRole('navigation', { name: 'Applications' })).toContainText(`Submitted ${today}`);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('status').last()).toHaveText('Submission date cleared.');
  await expect(page.getByRole('button', { name: 'Mark as submitted' })).toBeVisible();
});

test('saving an open draft preserves updates made by another window', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByLabel('Job title', { exact: true }).fill('Local job title');
  await page.evaluate(async () => {
    const { store } = await chrome.runtime.sendMessage({ type: 'store/get' });
    store.applications[0] = { ...store.applications[0], employerLabel: 'Updated employer', tenantKey: 'https://example.test/Careers', portalOrigin: 'https://example.test', skillSelections: ['Python'], stepsSeen: [{ label: 'Experience', at: '2026-10-22T00:00:00.000Z' }], submittedAt: '2026-10-22T00:00:00.000Z' };
    await chrome.runtime.sendMessage({ type: 'store/save', store });
  });
  await expect(page.getByRole('navigation', { name: 'Applications' })).toContainText('Updated employer');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(page.getByRole('status').last()).toHaveText('Saved.');
  const saved = await page.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store.applications[0]);
  expect(saved).toMatchObject({ employerLabel: 'Updated employer', jobTitle: 'Local job title', tenantKey: 'https://example.test/Careers', portalOrigin: 'https://example.test', skillSelections: ['Python'], stepsSeen: [{ label: 'Experience' }], submittedAt: '2026-10-22T00:00:00.000Z' });
});

test('concurrent edits to the same application field require review and preserve the draft', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await openApplications(page, extensionId);
  await newApp(page);
  await page.getByRole('textbox', { name: 'Employer', exact: true }).fill('Local employer');
  await page.evaluate(async () => {
    const { store } = await chrome.runtime.sendMessage({ type: 'store/get' });
    store.applications[0].employerLabel = 'Other employer';
    await chrome.runtime.sendMessage({ type: 'store/save', store });
  });
  await expect(page.getByRole('navigation', { name: 'Applications' })).toContainText('Other employer');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('changed in another window');
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('Local employer');
  expect(await page.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store.applications[0].employerLabel)).toBe('Other employer');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reload saved application' }).click();
  await expect(page.getByRole('textbox', { name: 'Employer', exact: true })).toHaveValue('Other employer');
});
