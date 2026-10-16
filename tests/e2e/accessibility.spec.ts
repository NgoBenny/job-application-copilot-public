import type { Page } from '@playwright/test';
import { expect, test } from './extension';
import { activate, GLOBEX, openSite, scan, setup } from './workday';

/** Every visible control must have an accessible name (label, aria-label, aria-labelledby or text). */
async function unnamedControls(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, select, textarea, button, [role="button"], a[href]')]
    .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
    .filter((el) => {
      const labelled = (el as HTMLInputElement).labels?.length || el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby') || (el.textContent ?? '').trim();
      return !labelled;
    })
    .map((el) => el.outerHTML.slice(0, 120)));
}

/** Elements sticking out past the viewport's right edge (empty = no horizontal scroll). Named so CI failures say what overflowed. */
const overflowing = (page: Page) => page.evaluate(() => {
  const width = document.documentElement.clientWidth;
  return [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => el.getBoundingClientRect().right > width + 1)
    .map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ').slice(0, 3).join('.')}` : ''}: ${(el.textContent ?? '').trim().slice(0, 40)}`)
    .slice(0, 5);
});

test('dashboard sections: every control is named and the page is keyboard-usable', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId);
  for (const section of ['Master profile', 'Applications', 'Saved answers', 'Employer accounts', 'Backup & privacy']) {
    await admin.getByRole('button', { name: section, exact: true }).click();
    expect(await unnamedControls(admin), section).toEqual([]);
  }
  // Keyboard: reach and use the first field without a mouse.
  await admin.getByRole('button', { name: 'Master profile', exact: true }).focus();
  await admin.keyboard.press('Enter');
  await admin.getByLabel('First name').focus();
  await admin.keyboard.type('X');
  await expect(admin.getByRole('button', { name: 'Save profile' })).toBeEnabled();
});

test('side panel works at a narrow width with named controls', async ({ context, extensionId }) => {
  const admin = await setup(context, extensionId, (s) => { s.profile.employment.push({ id: 'emp-2', employer: 'Globex Corporation', title: 'Data Analyst', location: '', start: '2025-01', end: '', current: true, bullets: [] }); });
  const { tabId } = await openSite(context, admin, GLOBEX);
  await activate(context, extensionId, tabId, 'Globex');
  const panel = await scan(context, extensionId, tabId);
  await panel.setViewportSize({ width: 320, height: 800 });
  await expect(panel.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
  expect(await unnamedControls(panel)).toEqual([]);
  expect(await overflowing(panel)).toEqual([]);
  // CI's Linux fonts are wider than Windows'; a wide fallback font keeps this check honest on every OS.
  await panel.addStyleTag({ content: '* { font-family: "Courier New", monospace !important; }' });
  expect(await overflowing(panel)).toEqual([]);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  expect(await unnamedControls(popup)).toEqual([]);
});
