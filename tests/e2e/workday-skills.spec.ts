import type { ResumeExtract } from '../../src/domain/resume/extract';
import { expect, test } from './extension';
import { activate, GLOBEX, openSite, pageState, scan, setup } from './workday';

const extract = (skills: string[]): ResumeExtract => ({
  source: 'json', resumeFilename: 'avery-globex.pdf', pdfFingerprint: '', candidate: { name: 'Avery Example', email: '', phone: '' }, links: [],
  education: [], experience: [], projects: [], skills: skills.map((name) => ({ name, evidence: 'resume' })), job: { company: 'Globex', title: '', url: '', description: '' }, warnings: [],
});

test('skills: exact, alias, broader-with-approval, not available, timeout, duplicate, never JD-only', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const admin = await setup(context, extensionId, (s) => {
    s.profile.skills = ['TypeScript', 'ReactJS', 'Node.js', 'Python', 'Kubernetes', 'Rust', 'Amazon Web Services', 'Excel'].map((name, i) => ({ id: `sk-${i}`, name }));
    const app = s.applications.find((a) => a.id === 'app-globex')!;
    // "Go" is on the resume and in the job description, but not a verified skill.
    app.imported = extract(['TypeScript', 'Node.js', 'Python', 'Rust', 'Go']);
    app.jobDescription = 'We use Kubernetes, Go and React every day.';
    app.persistJobDescription = true;
  });
  const { site, tabId } = await openSite(context, admin, GLOBEX);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);

  const list = panel.getByRole('list', { name: 'Your skills, ranked' });
  await expect(list.getByRole('checkbox')).toHaveCount(8);
  await expect(list).not.toContainText('Go');
  await expect(panel.getByText('not in your verified skills, so not offered: Go')).toBeVisible();
  for (const name of ['ReactJS', 'Kubernetes', 'Amazon Web Services']) await list.getByLabel(name).check();
  await panel.getByRole('button', { name: 'Search and add 7' }).click();

  const results = panel.getByRole('region', { name: 'Skill results' });
  await expect(results).toContainText('Node.js: Added', { timeout: 30_000 });
  await expect(results).toContainText('Kubernetes: Not available on this site', { timeout: 30_000 });
  await expect(results).toContainText('TypeScript: Already on the page');
  await expect(results).toContainText('ReactJS: Added (as "React")');
  await expect(results).toContainText('Rust: No clear answer from the site');
  await expect(results).toContainText('Python: Only similar options exist');
  await expect(results).toContainText('Amazon Web Services: Only similar options exist');

  const chips = () => site.locator('[data-automation-id="selectedItem"]').allTextContents();
  expect(await chips()).toEqual(['TypeScript', 'Node.js', 'React']);

  // A broader option is selected only after the user picks it, and can be remembered.
  await results.getByLabel('Remember options I choose below').check();
  await results.getByRole('button', { name: 'Use "Python (Programming Language)" for Python' }).click();
  await expect(results).toContainText('Python: Added (as "Python (Programming Language)")');
  expect(await chips()).toEqual(['TypeScript', 'Node.js', 'React', 'Python (Programming Language)']);
  await expect(site.locator('#sk')).toHaveValue('');

  const saved = await admin.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store);
  expect(saved.skillAliases).toEqual([{ skill: 'Python', option: 'Python (Programming Language)' }]);
  expect(saved.applications.find((a: { id: string }) => a.id === 'app-globex').skillSelections.sort()).toEqual(['Node.js', 'Python', 'ReactJS', 'TypeScript']);
  expect((await pageState(site)).navigated).toBe(false);
});
