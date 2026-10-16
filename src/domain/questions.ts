// Answer memory matching. Conservative by design: exact wording reuses, similar wording asks, inverted wording never reuses.
import { exactChoice, straightQuotes } from './options';
import type { Protection } from './policy';

export type Scope = 'global' | 'employer' | 'job';

export interface QuestionMemory {
  id: string;
  question: string;
  kind: 'choice' | 'text';
  answer: string;
  /** The choices that were visible when the user confirmed (choice questions only). */
  options: string[];
  scope: Scope;
  tenantKey: string;
  applicationId: string;
  confirmedAt: string;
}

const FILLER = /\b(please|kindly|do you|are you|have you|will you|would you|can you|be|currently|indicate|select|confirm|whether|the|a|an)\b/g;
const SYNONYMS: [RegExp, string][] = [[/\b(move|relocation)\b/g, 'relocate'], [/\b(employer|company|organization)\b/g, 'company'], [/\bwage|compensation|pay\b/g, 'salary']];
const NEGATION = /\b(not|never|no longer|unable|unwilling|without|decline|refuse|cannot)\b|n't\b/;

/** Wording identity for exact reuse. */
export function questionKey(q: string): string {
  return straightQuotes(q).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Looser identity used only to *propose* (never auto-approve) a match. */
function looseKey(q: string): string {
  let k = questionKey(q).replace(FILLER, ' ');
  for (const [re, to] of SYNONYMS) k = k.replace(re, to);
  // Negations are dropped here on purpose: a reversed question then matches, and findAnswer blocks it with a clear reason.
  return k.replace(/\b(un)(willing|able)\b/g, '$2').replace(/\b(not|never|no longer)\b|n't\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export const isNegated = (q: string) => NEGATION.test(q.toLowerCase());

export interface MemoryContext { tenantKey: string; applicationId: string; employer: string; jobTitle: string }

export type MemoryMatch = { memory: QuestionMemory; exact: boolean; answer: string } | { blocked: string };

/**
 * Finds the answer to reuse for a question, or why none can be used.
 * Scope precedence: this job > this employer > global; within a scope the latest confirmation wins.
 */
export function findAnswer(label: string, kind: 'choice' | 'text', options: readonly string[] | undefined, memories: readonly QuestionMemory[], ctx: MemoryContext, protection?: Protection): MemoryMatch | undefined {
  // Sensitive questions only ever use the dashboard's sensitive answers, never memory.
  if (protection) return undefined;
  const inScope = memories.filter((m) => m.kind === kind && (m.scope === 'global' || (m.scope === 'employer' && m.tenantKey === ctx.tenantKey) || (m.scope === 'job' && m.applicationId === ctx.applicationId)));
  const rank = (m: QuestionMemory) => (m.scope === 'job' ? 3 : m.scope === 'employer' ? 2 : 1);
  const sorted = [...inScope].sort((a, b) => rank(b) - rank(a) || b.confirmedAt.localeCompare(a.confirmedAt));
  const exact = sorted.find((m) => questionKey(m.question) === questionKey(label));
  const similar = !exact ? sorted.find((m) => looseKey(m.question) === looseKey(label)) : undefined;
  const m = exact ?? similar;
  if (!m) return undefined;
  if (isNegated(m.question) !== isNegated(label)) return { blocked: 'The wording is reversed compared with your saved answer, so it was not reused.' };
  const answer = renderTemplate(m.answer, ctx);
  // options undefined = a closed dropdown; its option is matched when clicked.
  if (kind === 'choice' && options) {
    if (m.options.length && !sameChoices(m.options, options)) return { blocked: 'The choices differ from when you saved this answer.' };
    if (!options.some((o) => questionKey(o) === questionKey(answer))) return { blocked: 'Your saved choice is not offered here.' };
  }
  return { memory: m, exact: !!exact, answer };
}

const sameChoices = (a: readonly string[], b: readonly string[]) => {
  const k = (xs: readonly string[]) => xs.map(questionKey).sort().join('|');
  return k(a) === k(b);
};

/** Templates: {{employer}} and {{jobTitle}} come from the current application, nothing else. */
export function renderTemplate(text: string, ctx: Pick<MemoryContext, 'employer' | 'jobTitle'>): string {
  return text.replace(/\{\{\s*(employer|jobTitle)\s*\}\}/g, (_, k: 'employer' | 'jobTitle') => ctx[k]);
}

// ---- Sensitive answers (user decision 2026-10-10): only from what the user typed in the dashboard ----

export type SensitiveTopic = 'gender' | 'race' | 'hispanic' | 'veteran' | 'disability' | 'authorizedToWork' | 'sponsorship' | 'conviction' | 'over18';

export const SENSITIVE_TOPICS: { topic: SensitiveTopic; category: Exclude<Protection, 'credential' | 'attestation'>; title: string; re: RegExp }[] = [
  { topic: 'gender', category: 'demographic', title: 'Gender', re: /\bgender\b|\bsex\b/ },
  { topic: 'race', category: 'demographic', title: 'Race / ethnicity', re: /\brace\b|\bracial\b|\bethnicity\b/ },
  { topic: 'hispanic', category: 'demographic', title: 'Hispanic or Latino', re: /hispanic|latin[oax]/ },
  // Not "military": government-employment (PGE/COI) questions mention it too.
  { topic: 'veteran', category: 'demographic', title: 'Veteran status', re: /veteran/ },
  { topic: 'disability', category: 'demographic', title: 'Disability status', re: /disabilit/ },
  { topic: 'authorizedToWork', category: 'authorization', title: 'Authorized to work', re: /authori[sz]ed to work|eligible to work|legally (authorized|eligible|permitted)|right to work/ },
  { topic: 'sponsorship', category: 'authorization', title: 'Needs visa sponsorship', re: /sponsor/ },
  { topic: 'conviction', category: 'legal', title: 'Criminal conviction', re: /convicted|conviction|felony/ },
  // "Are you 18 years or older?", "Are you at least 18 years of age?" (live Workday 2026-10-16).
  { topic: 'over18', category: 'demographic', title: '18 or older', re: /\b18 (years )?(or older|of age|or over)\b|\bat least 18\b|\bover (the age of )?18\b/ },
];

export interface SensitiveAnswer { topic: SensitiveTopic; answer: string }

/** Exactly one topic must match the label itself (a section heading alone is not enough), with no negation. */
export function sensitiveTopic(label: string): SensitiveTopic | undefined {
  const l = label.toLowerCase();
  const hits = SENSITIVE_TOPICS.filter((t) => t.re.test(l));
  return hits.length === 1 && !isNegated(l) ? hits[0]!.topic : undefined;
}

/**
 * A question that names no topic ("Please check one of the boxes below") takes its topic from the visible choices,
 * when they name exactly one, as on the federal CC-305 disability form (user decision 2026-10-12).
 */
function topicOf(label: string, options: readonly string[] | undefined): SensitiveTopic | undefined {
  const fromLabel = sensitiveTopic(label);
  if (fromLabel || SENSITIVE_TOPICS.some((t) => t.re.test(label.toLowerCase())) || !options) return fromLabel;
  const named = SENSITIVE_TOPICS.filter((t) => options.some((o) => t.re.test(o.toLowerCase())));
  return named.length === 1 ? named[0]!.topic : undefined;
}

/** The option to choose for a sensitive question, or undefined when anything is unclear. */
export function sensitiveChoice(label: string, protection: Protection | undefined, options: readonly string[] | undefined, saved: readonly SensitiveAnswer[]): { topic: SensitiveTopic; option: string } | undefined {
  const topic = topicOf(label, options);
  const def = SENSITIVE_TOPICS.find((t) => t.topic === topic);
  if (!def || def.category !== protection) return undefined;
  const answer = saved.find((s) => s.topic === topic)?.answer;
  if (!answer) return undefined;
  // Closed dropdown: proposed as typed; the write step requires an option with exactly this text.
  if (!options) return { topic: def.topic, option: answer };
  // Exact text only: "No" must never pick "No, but I will need sponsorship later".
  const i = exactChoice(options, answer, questionKey);
  return typeof i === 'number' && i >= 0 ? { topic: def.topic, option: options[i]! } : undefined;
}
