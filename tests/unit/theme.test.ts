import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readTheme, setTheme } from '../../src/ui/theme';

const osDark = (dark: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => undefined }));

describe('theme', () => {
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

  it('follows the system by default', () => {
    osDark(true); applyTheme();
    expect(readTheme()).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    osDark(false); applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('a chosen theme overrides the system and is remembered', () => {
    osDark(true);
    setTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(readTheme()).toBe('light');
    setTheme('dark'); osDark(false); applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem('theme', 'purple');
    expect(readTheme()).toBe('system');
  });
});
