import type { Detection } from '../../platform/adapter';

const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Workday candidate hosts. Other hosts are never treated as Workday, whatever their markup says. */
export function isWorkdayHost(hostname: string): boolean {
  return /(^|\.)myworkdayjobs\.com$/.test(hostname) || /(^|\.)myworkdaysite\.com$/.test(hostname) || /^wd\d+\.myworkday\.com$/.test(hostname);
}

/**
 * Employer identity: origin plus the path segments that name the tenant/site.
 * Two employers sharing a host (myworkdaysite.com) get different keys.
 */
export function tenantKey(url: URL): string | undefined {
  if (!isWorkdayHost(url.hostname)) return undefined;
  const segs = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (url.hostname.endsWith('myworkdaysite.com')) {
    // /recruiting/{tenant}/{site}/...
    const i = segs.indexOf('recruiting');
    return i >= 0 && segs[i + 1] && segs[i + 2] ? `${url.origin}/recruiting/${segs[i + 1]}/${segs[i + 2]}` : undefined;
  }
  if (url.hostname.endsWith('myworkday.com')) return segs[0] ? `${url.origin}/${segs[0]}` : undefined;
  // {tenant}.wdN.myworkdayjobs.com/[locale/]{site}/...
  const site = LOCALE.test(segs[0] ?? '') ? segs[1] : segs[0];
  return site ? `${url.origin}/${site}` : url.origin;
}

// Markers seen in Workday's candidate experience. shortcut: list from public markup; extend from live QA notes in docs/qa/.
const STRONG = ['applyFlowPage', 'progressBar', 'bottom-navigation-next-button', 'jobPostingHeader', 'adventureButton', 'utilityButtonSignIn', 'createAccountLink', 'signInContent', 'signInSubmitButton', 'createAccountSubmitButton', 'CandidateHomePage'];

export function detectWorkday(url: URL, doc: Document): Detection {
  const evidence: string[] = [];
  const key = tenantKey(url);
  if (!isWorkdayHost(url.hostname)) return { status: 'unsupported', evidence: ['Not a Workday host'] };
  evidence.push('Workday host');
  const strong = STRONG.filter((id) => doc.querySelector(`[data-automation-id="${id}"]`));
  evidence.push(...strong.map((id) => `marker:${id}`));
  if (!key) return { status: 'uncertain', evidence: [...evidence, 'Employer could not be identified from the URL'] };
  if (strong.length === 0) return { status: 'uncertain', tenantKey: key, evidence: [...evidence, 'No Workday page markers found yet'] };
  return { status: 'supported', tenantKey: key, evidence };
}
