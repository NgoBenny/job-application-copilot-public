import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  // Waits on the HTTPS port (opened last), so a reused older server without it is not mistaken for ready.
  webServer: { command: 'node tests/fixture-server.mjs', url: 'https://127.0.0.1:4174/index.html', ignoreHTTPSErrors: true, reuseExistingServer: !process.env.CI },
});
