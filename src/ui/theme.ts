// Light/dark choice for the extension's own pages. A per-device look, so it lives in the pages' localStorage, not the store.
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'theme';
const darkQuery = () => matchMedia('(prefers-color-scheme: dark)');

export function readTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}

export function applyTheme(theme: Theme = readTheme()) {
  document.documentElement.dataset.theme = theme === 'dark' || (theme === 'system' && darkQuery().matches) ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* unavailable storage: still applies to this page */ }
  applyTheme(theme);
}

/** Applies the saved theme now and keeps it current when the OS theme or another extension page changes it. */
export function watchTheme() {
  applyTheme();
  darkQuery().addEventListener('change', () => applyTheme());
  addEventListener('storage', (e) => { if (e.key === KEY) applyTheme(); });
}
