import type { Detection } from '../../platform/adapter';

// shortcut: hosted job boards only; forms embedded on employer sites (iframes) are unsupported, add them when a user's application needs it.
export function isGreenhouseHost(hostname: string): boolean {
  return /^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(hostname);
}

/** Employer identity: origin plus the board token, e.g. https://job-boards.greenhouse.io/acme. */
export function tenantKey(url: URL): string | undefined {
  if (!isGreenhouseHost(url.hostname)) return undefined;
  const board = url.pathname.split('/').filter(Boolean)[0];
  return board ? `${url.origin}/${decodeURIComponent(board)}` : undefined;
}

export function detectGreenhouse(url: URL, doc: Document): Detection {
  if (!isGreenhouseHost(url.hostname)) return { status: 'unsupported', evidence: ['Not a Greenhouse host'] };
  const key = tenantKey(url);
  const evidence = ['Greenhouse host'];
  if (!key) return { status: 'uncertain', evidence: [...evidence, 'Employer could not be identified from the URL'] };
  if (!doc.querySelector('form#application-form')) return { status: 'uncertain', tenantKey: key, evidence: [...evidence, 'No application form on this page'] };
  return { status: 'supported', tenantKey: key, evidence: [...evidence, 'form#application-form'] };
}
