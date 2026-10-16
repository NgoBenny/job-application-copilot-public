import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { E2E_HOSTS, RELEASE_PERMISSIONS } from '../../wxt.config';

describe('release manifest', () => {
  it('declares exactly the minimal permission set', () => {
    expect([...RELEASE_PERMISSIONS].sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
  });

  // Requires `npm run build` first (the gate order is build → test).
  it('built release manifest has no host access or test grants', () => {
    expect(existsSync('.output/chrome-mv3/manifest.json'), 'run `npm run build` first').toBe(true);
    const m = JSON.parse(readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
    expect([...m.permissions].sort()).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
    expect(m.host_permissions).toBeUndefined();
    expect(m.content_scripts).toBeUndefined();
    for (const host of E2E_HOSTS) expect(JSON.stringify(m)).not.toContain(host);
    expect(JSON.stringify(m)).not.toContain('<all_urls>');
  });
});
