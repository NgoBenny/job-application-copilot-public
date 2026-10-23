import { expect, FIXTURES, launchExtension, test } from './extension';
import { sampleStore } from '../fixtures/data/profile';

test('profile survives a browser restart', async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
  await page.getByLabel('First name').fill('Avery');
  await page.getByRole('button', { name: 'Add skill' }).click();
  await page.getByLabel('Skill', { exact: true }).fill('TypeScript');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved.');
  await ext.context.close();

  const again = await launchExtension(ext.userDataDir);
  const p2 = await again.context.newPage();
  await p2.goto(`chrome-extension://${again.extensionId}/options.html`);
  await expect(p2.getByLabel('First name')).toHaveValue('Avery');
  await expect(p2.getByLabel('Skill', { exact: true })).toHaveValue('TypeScript');
  await again.context.close();
});

test('invalid fields are reported and nothing is saved', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('URL').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').first()).toContainText('Not saved');
  await expect(page.getByLabel('URL')).toHaveAttribute('aria-invalid', 'true');
});

test('a malformed backup import changes nothing', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel('First name').fill('Avery');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('button', { name: 'Backup & privacy' }).click();
  await page.getByLabel('Import backup').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":1,"__proto__":{"x":1}}') });
  await expect(page.getByText(/Can't import: File contains a forbidden key/)).toBeVisible();
  await page.getByRole('button', { name: 'Master profile' }).click();
  await expect(page.getByLabel('First name')).toHaveValue('Avery');
});

test('a large exported backup can be imported again', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  const store = sampleStore();
  store.answers = Array.from({ length: 400 }, (_, n) => ({ id: `answer-${n}`, question: 'Synthetic question', kind: 'text', answer: 'x'.repeat(5000), options: [], scope: 'global', tenantKey: '', applicationId: '', confirmedAt: '2026-10-22T00:00:00.000Z' }));
  expect(await page.evaluate(async (store) => (await chrome.runtime.sendMessage({ type: 'store/save', store })).ok, store)).toBe(true);
  await page.getByRole('button', { name: 'Backup & privacy' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloading;
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  expect(buffer.byteLength).toBeGreaterThan(2_000_000);
  await page.getByLabel('Import backup').setInputFiles({ name: 'large.backup.json', mimeType: 'application/json', buffer });
  await expect(page.getByText(/This backup has/)).toContainText('400 saved answers');
  await page.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page.getByRole('status')).toHaveText('Backup imported.');
  expect(await page.evaluate(async () => (await chrome.runtime.sendMessage({ type: 'store/get' })).store.answers.length)).toBe(400);
});

test('a content script can neither read storage nor ask the service worker for it', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel('First name').fill('Avery');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Saved.');

  const site = await context.newPage();
  await site.goto(`${FIXTURES}/index.html`);
  const result = await page.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: async () => {
        let direct: string;
        try { direct = JSON.stringify(await chrome.storage.local.get(null)); } catch (e) { direct = `error: ${(e as Error).message}`; }
        let viaMessage: string;
        try { viaMessage = JSON.stringify(await chrome.runtime.sendMessage({ type: 'store/get' }) ?? null); } catch (e) { viaMessage = `error: ${(e as Error).message}`; }
        return { direct, viaMessage };
      },
    });
    return r!.result as { direct: string; viaMessage: string };
  }, `${FIXTURES}/*`);
  expect(result.direct).not.toContain('Avery');
  expect(result.direct).toMatch(/^error/);
  expect(result.viaMessage).not.toContain('Avery');
});
