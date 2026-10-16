import { expect, test } from './extension';

test('every extension surface renders without console errors', async ({ context, extensionId, consoleErrors }) => {
  for (const [page, heading] of [['popup', 'Job Application Copilot'], ['sidepanel', 'Step review'], ['options', 'Dashboard']]) {
    const tab = await context.newPage();
    await tab.goto(`chrome-extension://${extensionId}/${page}.html`);
    await expect(tab.getByRole('heading', { level: 1 })).toHaveText(heading!);
    await tab.close();
  }
  expect(consoleErrors).toEqual([]);
});
