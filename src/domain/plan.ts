// Proposal engine: compares a scanned step with the verified profile and proposes field actions.
// Platform-neutral: works only on ScanSnapshot semantics, never on DOM.
import type { Provenance, ScannedField, ScanSnapshot } from '../platform/adapter';
import type { ApplicationContent, Education, Employment, MasterProfile, OptionAlias } from './schemas';
import { degreeKey, matchOption, straightQuotes } from './options';
import { findAnswer, sensitiveChoice, SENSITIVE_TOPICS, type MemoryContext, type QuestionMemory, type SensitiveAnswer } from './questions';
import { nameKey, sameName } from './text';

export interface Proposal {
  actionId: string;
  /** 'set' writes a field; 'addRecord' clicks the section's Add button once. */
  type: 'set' | 'addRecord';
  fieldId: string;
  kind: ScannedField['kind'];
  label: string;
  /** Record group on the page, and the master record it was matched to. */
  recordKey?: string;
  recordId?: string;
  /** See ApprovedAction.expectedRecord. */
  expectedRecord?: string;
  current: string;
  proposed: string;
  /** The profile value a remembered search-box choice stands in for. */
  from?: string;
  provenance: Provenance;
  rationale: string;
  /** Eligible for "Approve all safe": fills an empty field from a confident match. */
  safe: boolean;
  /** Set for a sensitive question answered from the dashboard's sensitive answers; must equal the field's category at write time. */
  sensitiveCategory?: 'demographic' | 'authorization' | 'legal';
}

export interface RecordLink {
  recordKey: string;
  kind: 'employment' | 'education';
  label: string;
  /** undefined = no confident match; the user can link it by hand. */
  masterId?: string;
  reason: string;
}

export interface PlanResult {
  proposals: Proposal[];
  records: RecordLink[];
  /** Master records not present on the page (candidates for "Add another"). */
  missing: { kind: 'employment' | 'education'; masterId: string; label: string }[];
  /** Saved answers that exist but were deliberately not offered, with the reason. */
  notes: { label: string; reason: string }[];
}

/** At most this many entries are added per fill. */
export const MAX_ADDS = 3;

const norm = (s: string) => straightQuotes(s).replace(/\s+/g, ' ').trim().toLowerCase();
const CHOICE: ScannedField['kind'][] = ['select', 'dropdown', 'combobox', 'radio'];

/** Same value for the purpose of "already correct". Names compare loosely; everything else exactly (case/space-insensitive). */
export function sameValue(a: string, b: string, semantic?: string): boolean {
  if (norm(a) === norm(b)) return true;
  // "Masters of Science" = "Master of Science (M.S.)" (live QA 2026-10-12).
  if (semantic?.endsWith('degree') && degreeKey(a) && degreeKey(a) === degreeKey(b)) return true;
  if (semantic && /(employer|school|title|degree|major|country)$/.test(semantic)) return nameKey(a) === nameKey(b) && nameKey(a) !== '';
  // Phones: same digits, allowing a country-code prefix ("+1 (408) 555-0100" = "4085550100").
  if (semantic === 'contact.phone') {
    const [x, y] = [a, b].map((s) => s.replace(/\D/g, '')).sort((p, q) => q.length - p.length) as [string, string];
    // A country code may lead ("1 408…"); a leading 0 is a national trunk prefix that changes the number
    // (live Greenhouse 2026-10-12: switching the phone country to +358 and back left "040 …").
    const prefix = x.slice(0, x.length - y.length);
    return (y.length >= 7 && x === y) || (y.length >= 10 && x.endsWith(y) && prefix.length <= 3 && !prefix.startsWith('0'));
  }
  return false;
}

/** The page already holds one of the sensitive answer's wordings (one per line), exactly: "No (but later)" is not "No". */
export const holdsAnswer = (value: string, answer: string) => answer.split('\n').some((w) => sameValue(value, w));

/** Date value that fits the control: a year-only control gets the year; never invents a month. */
function dateFor(field: ScannedField, value: string): string {
  if (!value) return '';
  const yearOnly = /year/i.test(field.fieldId) || /year/i.test(field.label) || /^\d{4}$/.test(field.value ?? '');
  return yearOnly ? value.slice(0, 4) : value;
}

function contactValue(p: MasterProfile, semantic: string): string | undefined {
  const [group, key] = semantic.split('.') as [string, string];
  // "Location (City)" lists places as "City, State, Country": city and region together pin one down.
  // One box for the whole name (Ashby): "First Last".
  if (group === 'contact' && key === 'fullName') return [p.contact.firstName, p.contact.lastName].filter(Boolean).join(' ') || undefined;
  if (group === 'contact' && key === 'location') return p.contact.city ? [p.contact.city, p.contact.region].filter(Boolean).join(', ') : undefined;
  if (group === 'contact') return (p.contact as Record<string, string>)[key];
  if (group === 'links') return p.links.find((l) => l.kind === key)?.url;
  return undefined;
}

function employmentValue(e: Employment, key: string): string | undefined {
  switch (key) {
    case 'title': return e.title;
    case 'employer': return e.employer;
    case 'location': return e.location;
    case 'current': return String(e.current);
    case 'start': return e.start;
    case 'end': return e.current ? '' : e.end;
    case 'description': return e.bullets.join('\n');
  }
  return undefined;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Separate month and year boxes (Greenhouse): "2027-05" → "May" / "2027". A date without a month gives no month. */
function datePart(date: string, part: 'Month' | 'Year'): string | undefined {
  const [y, m] = date.split('-');
  return part === 'Year' ? y || undefined : m ? MONTHS[Number(m) - 1] : undefined;
}

function educationValue(e: Education, key: string): string | undefined {
  const split = /^(start|end)(Month|Year)$/.exec(key);
  if (split) return datePart(split[1] === 'start' ? e.start : e.end, split[2] as 'Month' | 'Year');
  return ({ school: e.school, degree: e.degree, major: e.major, start: e.start, end: e.end, gpa: e.gpa } as Record<string, string>)[key];
}

/** Stable text identity of one page record (employer/title/school/degree/start), compared before writing into it. */
export function recordIdentityKey(fields: readonly ScannedField[], recordKey: string): string {
  const id = recordIdentity(fields.filter((f) => f.recordKey === recordKey));
  return [id.employer, id.title, id.school, id.degree, id.start].map(norm).join('|');
}

/** Identity of a record group on the page, read from its scanned fields. */
function recordIdentity(fields: readonly ScannedField[]) {
  const get = (suffix: string) => fields.find((f) => f.semantic?.endsWith(suffix))?.value ?? '';
  return { employer: get('.employer'), title: get('.title'), school: get('.school'), degree: get('.degree'), start: get('.start') };
}

/**
 * Match page records to master records by identity (employer/school, then title/degree/start), never by position.
 * Records created empty in this session are paired with unmatched master records in profile order, flagged for review.
 */
export function linkRecords(snapshot: ScanSnapshot, profile: MasterProfile, manual: Record<string, string> = {}, content?: ApplicationContent): RecordLink[] {
  const groups = new Map<string, ScannedField[]>();
  for (const f of snapshot.fields) if (f.recordKey && /^(workExperience|education)-/.test(f.recordKey)) groups.set(f.recordKey, [...(groups.get(f.recordKey) ?? []), f]);
  const used = new Set(Object.values(manual));
  const links: RecordLink[] = [];
  const empties: RecordLink[] = [];
  for (const [recordKey, fields] of groups) {
    const kind = recordKey.startsWith('education') ? 'education' : 'employment';
    const id = recordIdentity(fields);
    const label = kind === 'employment' ? [id.title, id.employer].filter(Boolean).join(' at ') : id.school;
    if (manual[recordKey]) { links.push({ recordKey, kind, label, masterId: manual[recordKey], reason: 'Linked by you' }); continue; }
    if (!label) { const l: RecordLink = { recordKey, kind, label: 'New empty record', reason: '' }; empties.push(l); links.push(l); continue; }
    const pool: (Employment | Education)[] = kind === 'employment' ? profile.employment : profile.education;
    const name = (m: Employment | Education) => ('employer' in m ? m.employer : m.school);
    const second = (m: Employment | Education) => ('employer' in m ? m.title : m.degree);
    const candidates = pool.filter((m) => !used.has(m.id) && sameName(name(m), kind === 'employment' ? id.employer : id.school));
    const pageSecond = kind === 'employment' ? id.title : id.degree;
    const narrowed = candidates.length > 1 ? candidates.filter((m) => sameName(second(m), pageSecond) || (id.start && m.start === id.start)) : candidates;
    if (narrowed.length === 1) {
      used.add(narrowed[0]!.id);
      links.push({ recordKey, kind, label, masterId: narrowed[0]!.id, reason: candidates.length > 1 ? 'Matched by name and title/date' : 'Matched by name' });
    } else {
      links.push({ recordKey, kind, label, reason: candidates.length > 1 ? 'Several of your records could match. Link it yourself.' : 'Not found in your master profile.' });
    }
  }
  for (const e of empties) {
    const next = (e.recordKey.startsWith('education') ? profile.education : profile.employment).find((m) => !used.has(m.id)
      && (!content || (content.approved && (e.kind === 'education' ? content.educationIds.includes(m.id) : content.employment.some((r) => r.masterId === m.id)))));
    if (next) { used.add(next.id); e.masterId = next.id; e.reason = 'Empty record paired with a record that was missing from the page. Check it.'; }
  }
  return links;
}

export interface AnswerSources { memories: readonly QuestionMemory[]; sensitive: readonly SensitiveAnswer[]; ctx: MemoryContext; optionAliases?: readonly OptionAlias[] }

/** Questions without a profile meaning: saved answers (ordinary) or dashboard sensitive answers (sensitive). Never safe for sensitive or narrative text. */
function answerProposal(f: ScannedField, src: AnswerSources, notes?: PlanResult['notes']): Proposal | undefined {
  // A field inside a work/education entry differs per entry (e.g. GPA), so one saved answer can't fit them all.
  if (f.uncertain || f.disabled || f.value === undefined || f.semantic || f.recordKey) return undefined;
  const choice = f.kind === 'select' || f.kind === 'radio' || f.kind === 'dropdown' || f.kind === 'multiselect';
  if (!choice && f.kind !== 'text' && f.kind !== 'textarea' && f.kind !== 'date') return undefined;
  const options = f.kind === 'dropdown' ? undefined : f.options;
  const base = { actionId: `set:${f.fieldId}`, type: 'set' as const, fieldId: f.fieldId, kind: f.kind, label: f.label, current: f.value };
  if (f.protection === 'demographic' || f.protection === 'authorization' || f.protection === 'legal') {
    // Search boxes take no sensitive answers: their exact-choice write path doesn't exist.
    const hit = choice && f.kind !== 'multiselect' ? sensitiveChoice(f.label, f.protection, options, src.sensitive) : undefined;
    if (!hit || holdsAnswer(f.value, hit.option)) return undefined;
    return { ...base, proposed: hit.option, provenance: 'user', safe: false, sensitiveCategory: f.protection,
      rationale: `From the sensitive answers you saved in the dashboard (${SENSITIVE_TOPICS.find((t) => t.topic === hit.topic)!.title}).${hit.option.includes('\n') ? ' Fills whichever of your wordings the list shows exactly.' : ''} Check it before filling.` };
  }
  if (f.protection) return undefined;
  const m = findAnswer(f.label, choice ? 'choice' : 'text', options, src.memories, src.ctx);
  if (!m) return undefined;
  if ('blocked' in m) { notes?.push({ label: f.label, reason: m.blocked }); return undefined; }
  if (sameValue(f.value, m.answer) || (choice && f.value && matchOption([f.value], m.answer) === 0)) return undefined;
  return { ...base, proposed: m.answer, provenance: 'approved answer memory',
    rationale: `${m.exact ? 'Your saved answer to this question' : 'Your saved answer to a similarly worded question'} (${m.memory.scope}).${f.value ? " The page already has a different value; approve only if it's wrong." : ''}`,
    // Only an exact, visible choice is safe; text (narratives, templates) and closed dropdowns always need your OK.
    safe: m.exact && f.value === '' && (f.kind === 'select' || f.kind === 'radio') };
}

export function propose(snapshot: ScanSnapshot, profile: MasterProfile, manual: Record<string, string> = {}, answers?: AnswerSources, content?: ApplicationContent): PlanResult {
  // Match populated entries against every verified record before excluding unselected records.
  const records = linkRecords(snapshot, profile, manual, content);
  if (content) profile = {
    ...profile,
    employment: content.approved ? profile.employment.filter((e) => content.employment.some((r) => r.masterId === e.id)) : [],
    education: content.approved ? profile.education.filter((e) => content.educationIds.includes(e.id)) : [],
  };
  for (const r of records) {
    if (r.masterId && !(r.kind === 'education' ? profile.education : profile.employment).some((m) => m.id === r.masterId)) {
      r.masterId = undefined; r.reason = 'Not selected for this application, or awaiting content approval. Left unchanged.';
    }
  }
  const byKey = new Map(records.map((r) => [r.recordKey, r]));
  const proposals: Proposal[] = [];
  const notes: PlanResult['notes'] = [];
  if (content && !content.approved) notes.push({ label: 'Application content', reason: 'Review and approve the selected records and wording in the dashboard before filling experience or education.' });
  for (const f of snapshot.fields) {
    const fromAnswers = answers && answerProposal(f, answers, notes);
    if (fromAnswers) { proposals.push(fromAnswers); continue; }
    if (!f.semantic || f.protection || f.uncertain || f.disabled || f.value === undefined) continue;
    const [group, key] = f.semantic.split('.') as [string, string];
    let value: string | undefined;
    let recordId: string | undefined;
    let rationale = '';
    let provenance: Provenance = 'master';
    let pairedEmpty = false;
    if (group === 'contact' || group === 'links') {
      value = contactValue(profile, f.semantic);
      rationale = 'From your master profile';
    } else if ((group === 'employment' || group === 'education') && f.recordKey) {
      const link = byKey.get(f.recordKey);
      if (!link?.masterId) continue;
      recordId = link.masterId;
      pairedEmpty = link.label === 'New empty record';
      const m = group === 'employment' ? profile.employment.find((x) => x.id === recordId) : profile.education.find((x) => x.id === recordId);
      if (!m) continue;
      value = group === 'employment' ? employmentValue(m as Employment, key) : educationValue(m as Education, key);
      rationale = `Matches your record "${'employer' in m ? `${m.title} at ${m.employer}` : m.school}" (${link.reason.toLowerCase()})`;
      if (group === 'employment' && key === 'description' && content?.approved) {
        value = content.employment.find((e) => e.masterId === recordId)?.description;
        provenance = 'approved application';
        rationale = 'From the wording you reviewed and approved for this application';
      }
    }
    if (value === undefined || value === '') continue; // never propose clearing a field or inventing a value
    if (f.kind === 'date') value = dateFor(f, value);
    // Search box options you chose before for this value ("Use …"/"Keep …") are accepted too, after the profile wording, one per line.
    const aliases = f.kind === 'multiselect' ? (answers?.optionAliases ?? []).filter((a) => a.field === f.semantic && sameValue(a.value, value!, f.semantic)).map((a) => a.option) : [];
    const from = aliases.length ? value : undefined;
    if (aliases.length) { rationale = `${rationale}; or a choice you kept before for "${value}"`; value = [...new Set([value, ...aliases])].join('\n'); }
    const acceptedValues = f.kind === 'multiselect' ? value.split('\n') : [value];
    if (acceptedValues.some((v) => sameValue(f.value ?? '', v, f.semantic))) continue;
    // A choice control already showing the matching option ("United States of America" for "United States") is correct.
    if (CHOICE.includes(f.kind) && f.value && matchOption([f.value], value) === 0) continue;
    const correction = f.value !== '';
    proposals.push({
      actionId: `set:${f.fieldId}`, type: 'set', fieldId: f.fieldId, kind: f.kind, label: f.label, recordKey: f.recordKey, recordId,
      ...(f.recordKey ? { expectedRecord: recordIdentityKey(snapshot.fields, f.recordKey) } : {}),
      current: f.value, proposed: value, ...(from ? { from } : {}), provenance,
      // A value already on the page has unknown authorship (maybe the parser, maybe you), so changing it needs your approval.
      rationale: correction ? `${rationale}. The page already has a different value; approve only if it's wrong.` : rationale,
      safe: provenance === 'master' && !correction && !pairedEmpty && f.kind !== 'checkbox' && f.kind !== 'multiselect', // search boxes may only offer similar choices
    });
  }
  const linked = new Set(records.map((r) => r.masterId).filter(Boolean));
  const missing = [
    ...profile.employment.filter((e) => !linked.has(e.id)).map((e) => ({ kind: 'employment' as const, masterId: e.id, label: [e.title, e.employer].filter(Boolean).join(' at ') })),
    ...profile.education.filter((e) => !linked.has(e.id)).map((e) => ({ kind: 'education' as const, masterId: e.id, label: e.school })),
  ];
  // Only offer "Add another" on a step that actually has that section.
  const hasSection = (kind: 'employment' | 'education') => records.some((r) => r.kind === kind) || snapshot.fields.some((f) => f.semantic?.startsWith(kind));
  for (const m of missing.filter((x) => hasSection(x.kind)).slice(0, MAX_ADDS)) {
    proposals.push({
      actionId: `add:${m.kind}:${m.masterId}`, type: 'addRecord', fieldId: m.kind === 'employment' ? 'workExperience' : 'education', kind: 'unknown',
      label: `Add ${m.kind === 'employment' ? 'work experience' : 'education'}: ${m.label}`, recordId: m.masterId,
      current: '', proposed: m.label, provenance: 'master', rationale: 'This record from your master profile is not on the page yet. Adds one empty entry; scan again to fill it.', safe: false,
    });
  }
  return { proposals, records, missing, notes };
}
