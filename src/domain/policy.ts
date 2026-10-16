// Protected-field policy. Platform-neutral: adapters pass whatever text describes a field
// (label, section, input type, autocomplete) and get a category back *before* reading its value.

export type Protection = 'credential' | 'attestation' | 'demographic' | 'authorization' | 'legal';

/** Never read, never written, never stored. */
export const UNTOUCHABLE: ReadonlySet<Protection> = new Set(['credential', 'attestation']);

const RULES: [Protection, RegExp][] = [
  ['credential', /\b(password|passcode|pass code|one[- ]time|otp|verification code|security code|captcha|pin|sign ?in|log ?in|create (an )?account|register|forgot password)\b/i],
  // Also acknowledgements and messaging consents ("Applicant Privacy Acknowledgement", "receive communications via SMS"; live Greenhouse 2026-10-12).
  ['attestation', /\b(i (agree|accept|certify|acknowledge|attest|consent)|acknowledg(e|ement|ment)|receive (communications|messages|texts|text messages)|opt[- ]in|terms (and|&) conditions|terms of (use|service)|privacy (policy|statement)|e-?signature|electronic signature|sign(ature)? (here|below)|attestation|certif(y|ication) (that|statement))\b/i],
  ['authorization', /\b(authori[sz]ed to work|work authori[sz]ation|eligible to work|legally (authorized|eligible|permitted)|sponsor(ship)?|visa|citizenship|citizen|immigration|right to work|work permit|export control)\b/i],
  ['demographic', /\b(gender|sex|race|racial|ethnicity|ethnic|hispanic|latino|veterans?|military|disabilit(y|ies)|sexual orientation|transgender|pronouns?|date of birth|birth ?date|age|marital|religion|self[- ]identif\w*|voluntary disclosures?|equal (employment )?opportunity|eeo)\b/i],
  ['legal', /\b(convicted|conviction|criminal|felony|misdemeanor|arrest(ed)?|background check|non-?compete|non-?solicit|government (official|employee)|debarred|terminated (from|for cause)|discharged)\b/i],
];

export interface FieldDescription {
  label: string;
  section: string;
  inputType?: string;
  autocomplete?: string;
}

/** Classifies from description only. The first matching rule wins, in order of how dangerous a mistake would be. */
export function classifyProtection(f: FieldDescription): Protection | undefined {
  if (f.inputType === 'password') return 'credential';
  if (/(current|new)-password|one-time-code/.test(f.autocomplete ?? '')) return 'credential';
  for (const [category, re] of RULES) if (re.test(f.label)) return category;
  // A field inside a sensitive section is sensitive even if its own label is bland (e.g. "Please select").
  for (const [category, re] of RULES) if (re.test(f.section)) return category;
  return undefined;
}
