import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: { command: 'node tests/fixture-server.mjs', url: 'http://127.0.0.1:4173/index.html', reuseExistingServer: !process.env.CI },
});
