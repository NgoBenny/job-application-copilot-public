import { chromium, test as base, type BrowserContext, type ConsoleMessage } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3-e2e');
export const FIXTURES = 'http://127.0.0.1:4173';

/** Launch Chromium with the e2e build; reuse `userDataDir` to simulate a browser restart. */
export async function launchExtension(userDataDir = mkdtempSync(join(tmpdir(), 'copilot-e2e-'))) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--host-resolver-rules=MAP *.myworkdayjobs.com 127.0.0.1:4173, MAP *.myworkdaysite.com 127.0.0.1:4173, MAP job-boards.greenhouse.io 127.0.0.1:4173',
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, userDataDir, extensionId: new URL(worker.url()).host };
}

export const test = base.extend<{ ext: Awaited<ReturnType<typeof launchExtension>>; context: BrowserContext; extensionId: string; consoleErrors: string[] }>({
  // eslint-disable-next-line no-empty-pattern
  ext: async ({}, use) => {
    const ext = await launchExtension();
    await use(ext);
    await ext.context.close();
  },
  context: async ({ ext }, use) => use(ext.context),
  extensionId: async ({ ext }, use) => use(ext.extensionId),
  consoleErrors: async ({ context }, use) => {
    const errors: string[] = [];
    const onConsole = (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); };
    context.on('weberror', (e) => errors.push(e.error().message));
    context.on('console', onConsole);
    for (const w of context.serviceWorkers()) w.on('console', onConsole);
    await use(errors);
  },
});

export const expect = test.expect;
