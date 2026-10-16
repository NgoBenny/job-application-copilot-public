import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './extension';
import { activate, openSite, pageState, scan, setup, SUMMIT_EXP, SUMMIT_QUESTIONS, VISTA_EXP, VISTA_INFO } from './workday';

// Regressions found on a live Workday tenant (docs/qa/2026-10-10-workday-employer-1.md), replayed on a fabricated
// look-alike (fixtures/workday/vista) whose widgets save values the way the live site does.

type Wd = { saved: Record<string, unknown>; save: () => string[] };
const saved = (site: Page) => site.evaluate(() => (window as unknown as { __wd: Wd }).__wd.saved);
const saveErrors = (site: Page) => site.evaluate(() => (window as unknown as { __wd: Wd }).__wd.save());

/** Real Chrome behind a focused side panel: the site has no focus and fires no native focus/blur events. */
async function unfocus(context: BrowserContext, site: Page) {
  const cdp = await context.newCDPSession(site);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
}

/** Clicks a fill button and waits for *new* results: an earlier fill's results may still be on screen. */
async function fill(panel: Page, button = panel.getByRole('button', { name: /^Fill \d+ approved$/ })) {
  const region = panel.getByRole('region', { name: 'Fill results' });
  const before = (await region.count()) ? await region.innerText() : '';
  await button.click();
  await expect(region).not.toHaveText(before, { timeout: 20_000 });
  await expect(panel.getByRole('button', { name: 'Filling…' })).toHaveCount(0, { timeout: 20_000 });
}

test('live-like My Information: text and dropdowns are saved by the site, not just shown', async ({ context, extensionId, consoleErrors }) => {
  const admin = await setup(context, extensionId, (s) => { s.profile.contact.region = 'California'; });
  const { site, tabId } = await openSite(context, admin, VISTA_INFO);
  await unfocus(context, site);
  await activate(context, extensionId, tabId, 'Vista');
  const panel = await scan(context, extensionId, tabId);
  expect(await site.evaluate(() => document.hasFocus())).toBe(false);

  // The progress bar shows "current step 1 of 3" before the name: the page heading names the step.
  await expect(panel.locator('#step-h')).toHaveText('My Information');
  await panel.getByRole('button', { name: /^Approve all safe/ }).click();
  await fill(panel);
  const results = panel.getByRole('region', { name: 'Fill results' });
  for (const label of ['First Name', 'Last Name', 'Country', 'State', 'City', 'Phone Number']) await expect(results).toContainText(`Filled and verified: ${label}`);

  // Saved on blur although the page never had focus; State came from its own list, not the pill or Country's lingering list.
  expect(await saved(site)).toMatchObject({
    'name--legalName--firstName': 'Avery', 'name--legalName--lastName': 'Example', 'address--city': 'Springfield', 'phoneNumber--phoneNumber': '555-0100',
    'country--country': 'United States of America', 'address--countryRegion': 'California',
  });
  expect(await saveErrors(site)).toEqual([]);
  expect((await pageState(site)).navigated).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('live-like My Experience: entries, dates, degree, Add Another, Field of Study and skills', async ({ context, extensionId }) => {
  test.setTimeout(120_000);
  const admin = await setup(context, extensionId, (s) => {
    s.profile.employment.push({ id: 'emp-2', employer: 'Initech', title: 'Junior Developer', location: '', start: '2025-01', end: '2025-05', current: false, bullets: [] });
    s.profile.skills = [{ id: 'sk-1', name: 'CSS' }, { id: 'sk-2', name: 'HTML' }];
  });
  const { site, tabId } = await openSite(context, admin, VISTA_EXP);
  await unfocus(context, site);
  await activate(context, extensionId, tabId, 'Vista');
  const panel = await scan(context, extensionId, tabId);
  expect(await site.evaluate(() => document.hasFocus())).toBe(false);
  await expect(panel.locator('#step-h')).toHaveText('My Experience');

  // Entries are found through their aria-labelledby h5 headings.
  const entries = panel.getByRole('region', { name: 'Entries on this page' });
  await expect(entries).toContainText('Empty record paired');
  for (const b of await panel.getByRole('button', { name: 'Approve all in this group' }).all()) await b.click();
  await fill(panel);
  const results = panel.getByRole('region', { name: 'Fill results' });
  for (const label of ['Job Title', 'Company', 'From', 'To', 'School or University', 'Degree']) await expect(results).toContainText(`Filled and verified: ${label}`);

  // Field of Study: the site auto-picked its only result; the extension removed it and offers it for approval.
  await expect(results).toContainText('Only a similar choice exists: "Computer and Information Science"');
  await fill(panel, results.getByRole('button', { name: 'Use "Computer and Information Science"' }));
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Filled and verified: Field of Study');

  // Add Another (h4 section heading) added exactly one entry; filling it after a rescan.
  await expect(site.locator('#Work-Experience-2-panel')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Scan this step' }).click();
  // The "Use" choice was remembered: Field of Study now counts as filled, so it isn't proposed again.
  await expect(panel.getByRole('group', { name: 'Example State University' })).toHaveCount(0);
  await panel.getByRole('group', { name: 'New empty record' }).getByRole('button', { name: 'Approve all in this group' }).click();
  await fill(panel);

  // Skills: Enter with keyCode 13, inner promptLeafNode clicks, and "PSD to HTML CSS" from the CSS results never answers HTML.
  const list = panel.getByRole('list', { name: 'Your skills, ranked' });
  for (const name of ['CSS', 'HTML']) await list.getByLabel(name).check();
  await panel.getByRole('button', { name: 'Search and add 2' }).click();
  const skills = panel.getByRole('region', { name: 'Skill results' });
  await expect(skills).toContainText('CSS: Added', { timeout: 30_000 });
  await expect(skills).toContainText('HTML: Added', { timeout: 30_000 });

  expect(await saved(site)).toMatchObject({
    'workExperience-7--startDate': '06/2024', 'workExperience-7--endDate': '08/2024', 'education-8--degree': 'B.S.',
    'education-8--fieldOfStudy': ['Computer and Information Science'], skills: expect.arrayContaining(['CSS', 'HTML']),
  });
  expect(await saveErrors(site)).toEqual([]);
  expect((await pageState(site)).navigated).toBe(false);
});

test('live-like skills: more skills than one request allows are searched in batches', async ({ context, extensionId }) => {
  test.setTimeout(180_000);
  // 52 skills: over the old 50-per-request cap (live QA: 77 gave "Invalid request."), so three batches.
  const names = ['CSS', 'HTML', ...Array.from({ length: 50 }, (_, i) => `Skill ${String(i + 1).padStart(2, '0')}`)];
  const admin = await setup(context, extensionId, (s) => { s.profile.skills = names.map((name, i) => ({ id: `sk-${i}`, name })); });
  const { site, tabId } = await openSite(context, admin, VISTA_EXP);
  await unfocus(context, site);
  await activate(context, extensionId, tabId, 'Vista');
  const panel = await scan(context, extensionId, tabId);
  const list = panel.getByRole('list', { name: 'Your skills, ranked' });
  for (const name of names) await list.getByLabel(name).check();
  await panel.getByRole('button', { name: 'Search and add 52' }).click();
  const skills = panel.getByRole('region', { name: 'Skill results' });
  await expect(skills).toContainText('CSS: Added', { timeout: 60_000 });
  await expect(skills).toContainText('Skill 50: Not available on this site', { timeout: 150_000 });
  await expect(skills.getByRole('listitem')).toHaveCount(52);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect((await saved(site)).skills).toEqual(expect.arrayContaining(['CSS', 'HTML']));
});

test('live-like Autofill with Resume: parser values need OK, level-only degrees, GPA per school', async ({ context, extensionId }) => {
  test.setTimeout(120_000);
  const admin = await setup(context, extensionId, (s) => {
    s.profile.education = [
      { id: 'edu-1', school: 'Example State University', degree: 'Bachelors of Science', major: 'Computer Science', start: '2021-09', end: '2025-05', status: 'completed', gpa: '3.5' },
      { id: 'edu-2', school: 'Sample Institute of Technology', degree: 'Masters of Science', major: 'Computer Science', start: '2025-08', end: '2027-05', status: 'in progress', gpa: '3.9' },
    ];
  });
  const { site, tabId } = await openSite(context, admin, SUMMIT_EXP);
  await unfocus(context, site);
  await activate(context, extensionId, tabId, 'Summit');
  const panel = await scan(context, extensionId, tabId);

  // Check 5: the parser's title differs from the profile, so changing it needs your OK and is left out of "safe".
  const job = panel.getByRole('group', { name: 'Software Engineer Intern at Acme Robotics' });
  await expect(job).toContainText('needs your OK');
  await panel.getByRole('button', { name: /^Approve all safe/ }).click();
  await fill(panel);
  const results = panel.getByRole('region', { name: 'Fill results' });
  await expect(results).not.toContainText('Job Title');

  // Entries in the parser's order still get their own school's degree level and GPA.
  expect(await saved(site)).toMatchObject({
    'education-4--degree': 'Masters', 'education-4--gradeAverage': '3.9',
    'education-5--degree': 'Bachelors', 'education-5--gradeAverage': '3.5',
  });
  await expect(site.locator('#workExperience-3--jobTitle')).toHaveValue('Software Engineer Intern');
  expect(await saveErrors(site)).toEqual([]);
});

test('live-like questions: a remembered MM/DD/YYYY date fills; the terms box is never ticked', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => {
    s.answers = [{ id: 'm1', question: 'Date Available', kind: 'text', answer: '2027-05-17', options: [], scope: 'global', tenantKey: '', applicationId: '', confirmedAt: '2026-10-11T00:00:00.000Z' }];
  });
  const { site, tabId } = await openSite(context, admin, SUMMIT_QUESTIONS);
  await unfocus(context, site);
  await activate(context, extensionId, tabId, 'Summit');
  const panel = await scan(context, extensionId, tabId);

  await expect(panel.getByText('Yes, I have read and consent to the terms and conditions')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Approve all safe \(0\)/ })).toBeVisible();
  await panel.getByRole('group', { name: 'This step' }).getByRole('button', { name: 'Approve all in this group' }).click();
  await fill(panel);
  await expect(panel.getByRole('region', { name: 'Fill results' })).toContainText('Filled and verified: Date Available');
  // One date field, not a stray day input posing as its own "Date Available" question.
  await expect(panel.getByRole('region', { name: 'Fill results' }).getByRole('listitem')).toHaveCount(1);

  expect(await saved(site)).toMatchObject({ dateAvailable: '05/17/2027' });
  await expect(site.locator('#agreement')).not.toBeChecked();
  expect(await saveErrors(site)).toEqual(['Terms is required']);
  expect((await pageState(site)).navigated).toBe(false);
});

