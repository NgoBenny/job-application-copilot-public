import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Release permissions. `manifest.test.ts` asserts this exact set.
export const RELEASE_PERMISSIONS = ['activeTab', 'scripting', 'storage', 'sidePanel'];

// Test-only: `--mode e2e` grants the fixture origins (Workday hostnames are mapped to the local
// fixture server by Playwright) so tests can inject without a real toolbar click.
export const E2E_HOSTS = ['http://127.0.0.1:4173/*', 'http://*.myworkdayjobs.com/*', 'http://*.myworkdaysite.com/*', 'http://job-boards.greenhouse.io/*'];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ mode }) => ({
    name: 'Job Application Copilot',
    description: 'Review and fill job applications from your verified profile. Never submits.',
    permissions: RELEASE_PERMISSIONS,
    ...(mode === 'e2e' ? { host_permissions: E2E_HOSTS } : {}),
    action: { default_title: 'Job Application Copilot' },
  }),
});
