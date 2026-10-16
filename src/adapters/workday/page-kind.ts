// What kind of Workday page this is, from visible, non-secret evidence only. Unknown when unsure.
import type { PageKind } from '../../platform/adapter';

// Text nodes joined with spaces (textContent glues "Sign In" + "Sign in with Google" into "Sign InSign in…");
// still not innerText, so no forced layout in the employer's page on every change.
function text(doc: Document): string {
  if (!doc.body) return '';
  const parts: string[] = [];
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.nodeValue ?? '');
  return parts.join(' ').replace(/\s+/g, ' ');
}
const has = (doc: Document, ids: string[]) => ids.some((id) => doc.querySelector(`[data-automation-id="${id}"]`));

export function pageKind(doc: Document): { kind: PageKind; sso: string[] } {
  const t = text(doc);
  const sso = [
    // The button can also be Google's own iframe, or an icon button with only an aria-label.
    ...(has(doc, ['SignInWithGoogleButton', 'googleSignInButton']) || /\b(sign|log) in with google\b|continue with google/i.test(t)
      || doc.querySelector('iframe[src*="accounts.google.com"], [aria-label*="with Google" i], [data-automation-id*="google" i]') ? ['Google'] : []),
    ...(/\b(sign|log) in with (microsoft|linkedin|apple)\b/i.exec(t)?.slice(2, 3) ?? []),
  ];
  const password = doc.querySelectorAll('input[type="password"]').length;
  const fields = doc.querySelectorAll('input:not([type="hidden"]):not([type="password"]), select, textarea').length;

  // Confirmation: strong wording and no form left to fill.
  if (fields === 0 && password === 0 && /\b(application (has been |was )?submitted|thank you for (applying|your application)|we('ve| have) received your application)\b/i.test(t)) return { kind: 'confirmation', sso };
  if (/\b(verify|confirm) your (email|account)\b|verification (email|link) (has been )?sent/i.test(t) && password === 0) return { kind: 'verifyEmail', sso };
  if (password >= 2 || has(doc, ['createAccountSubmitButton', 'createAccountCheckbox'])) return { kind: 'createAccount', sso };
  if (password === 1 || has(doc, ['signInSubmitButton', 'signInContent'])) return { kind: 'signIn', sso };
  if (has(doc, ['applyFlowPage', 'progressBar'])) return { kind: 'application', sso };
  return { kind: 'unknown', sso };
}
