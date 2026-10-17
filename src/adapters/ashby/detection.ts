import type { Detection } from '../../platform/adapter';

// shortcut: hosted jobs.ashbyhq.com only; Ashby forms embedded on employer sites (iframes) are unsupported, add them when a user's application needs it.
export const isAshbyHost = (hostname: string) => hostname === 'jobs.ashbyhq.com';

/** Employer identity: origin plus the board name, e.g. https://jobs.ashbyhq.com/acme. */
export function tenantKey(url: URL): string | undefined {
  if (!isAshbyHost(url.hostname)) return undefined;
  const board = url.pathname.split('/').filter(Boolean)[0];
  return board ? `${url.origin}/${decodeURIComponent(board)}` : undefined;
}

export function detectAshby(url: URL, doc: Document): Detection {
  if (!isAshbyHost(url.hostname)) return { status: 'unsupported', evidence: ['Not an Ashby host'] };
  const key = tenantKey(url);
  const evidence = ['Ashby host'];
  if (!key) return { status: 'uncertain', evidence: [...evidence, 'Employer could not be identified from the URL'] };
  // Only the Application tab (/<board>/<job>/application) holds the form; the job description tab never counts.
  const onApplication = url.pathname.split('/').filter(Boolean)[2] === 'application';
  if (!onApplication || !doc.querySelector('.ashby-application-form-field-entry')) return { status: 'uncertain', tenantKey: key, evidence: [...evidence, 'No application form on this page'] };
  return { status: 'supported', tenantKey: key, evidence: [...evidence, 'ashby-application-form-field-entry'] };
}
