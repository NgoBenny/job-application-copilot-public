// Read-only inventory of a Greenhouse application form (job-boards.greenhouse.io). One page, no steps.
import { classifyProtection, UNTOUCHABLE } from '../../domain/policy';
import type { FieldKind, ScannedField, ScanSnapshot } from '../../platform/adapter';

export type ScanResult = { snapshot: ScanSnapshot; elements: Map<string, Element> };

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim();

// Greenhouse's own field ids (the part before "--N" in repeated education blocks).
const BY_ID: Record<string, string> = {
  first_name: 'contact.firstName', last_name: 'contact.lastName', preferred_name: 'contact.preferredName', email: 'contact.email',
  phone: 'contact.phone', country: 'contact.country', 'candidate-location': 'contact.location',
  school: 'education.school', degree: 'education.degree', discipline: 'education.major',
  'start-month': 'education.startMonth', 'start-year': 'education.startYear', 'end-month': 'education.endMonth', 'end-year': 'education.endYear',
  resume: 'resume.file',
};
// Custom questions (question_123) keep only their label.
const BY_LABEL: [RegExp, string][] = [[/linkedin/i, 'links.linkedin'], [/github/i, 'links.github'], [/^(personal )?(website|portfolio)( url)?$/i, 'links.portfolio']];

function labelOf(el: Element, doc: Document): string {
  const byFor = el.id ? doc.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const byAria = doc.getElementById(el.getAttribute('aria-labelledby')?.split(' ')[0] ?? '');
  return clean((byFor ?? byAria)?.textContent);
}

/** The block a field sits in: the education block, or the last section heading before it (e.g. "Voluntary Self-Identification"). */
function sectionOf(el: Element, headings: Element[]): string {
  if (el.closest('.education--container')) return 'Education';
  const before = headings.filter((h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  return clean(before.at(-1)?.textContent);
}

function kindOf(el: Element): FieldKind {
  // Multi-answer dropdowns too (live Greenhouse board 3 Gender): the extension only ever puts one answer into an empty one.
  if (el.getAttribute('role') === 'combobox') return 'dropdown';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  const type = (el as HTMLInputElement).type;
  return ({ checkbox: 'checkbox', radio: 'radio', file: 'file', url: 'url' } as Record<string, FieldKind>)[type] ?? 'text';
}

/** A React-Select shows its choice beside the input; the input itself only holds search text. */
export function dropdownValue(input: Element): string {
  const control = input.closest('.select__control');
  const chips = [...(control?.querySelectorAll('.select__multi-value__label') ?? [])];
  if (chips.length) return chips.map((c) => clean(c.textContent)).join('; ');
  const shown = control?.querySelector('.select__single-value');
  // The phone Country picker shows only a flag and "+1"; the country's name is on the phone widget's button.
  if (shown?.querySelector('.iti__flag')) return clean(input.closest('fieldset')?.querySelector('.iti__selected-country')?.getAttribute('title')) || clean(shown.textContent);
  return clean(shown?.textContent);
}

export function scanGreenhouse(doc: Document, revision: number): ScanResult {
  const form = doc.querySelector('form#application-form');
  const elements = new Map<string, Element>();
  const fields: ScannedField[] = [];
  const seen = new Set<Element>();
  const headings = form ? [...form.querySelectorAll('h2, h3')] : [];

  for (const el of form?.querySelectorAll('input, select, textarea') ?? []) {
    const input = el as HTMLInputElement;
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(input.type)) continue;
    // Validation decoys beside each dropdown: aria-hidden, unlabeled, never the user's field.
    if (el.getAttribute('aria-hidden') === 'true' || !el.id) continue;
    // The phone widget's own country search (hidden until opened); its value is set through the Country dropdown.
    if (el.closest('.iti__country-container')) continue;
    let kind = kindOf(el);
    let group: HTMLInputElement[] = [input];
    let target: Element = el;
    let label = labelOf(el, doc);
    // Several boxes (or radios) under one question: one choice field, named by the fieldset's legend.
    const set = (kind === 'checkbox' || kind === 'radio') ? el.closest('fieldset') : null;
    if (set && set.querySelectorAll(`input[type="${input.type}"]`).length > 1) {
      if (seen.has(set)) continue;
      seen.add(set);
      group = [...set.querySelectorAll<HTMLInputElement>(`input[type="${input.type}"]`)];
      kind = 'radio';
      target = set;
      label = clean(set.querySelector('legend')?.textContent);
    }
    const section = sectionOf(el, headings);
    const base = el.id.replace(/--\d+$/, '');
    const n = /--(\d+)$/.exec(el.id)?.[1];
    const recordKey = n !== undefined && el.closest('.education--container') ? `education-${Number(n) + 1}` : undefined;
    const protection = classifyProtection({ label, section, inputType: input.type, autocomplete: input.autocomplete });
    // Label rules name links, so they only fit text boxes: "Did you find us on LinkedIn?" (Yes/No) is a question, not your URL.
    const byLabel = kind === 'text' || kind === 'url' ? BY_LABEL.find(([re]) => re.test(label))?.[1] : undefined;
    const semantic = protection ? undefined : BY_ID[base] ?? byLabel;
    const fieldId = target === el ? el.id : (target as HTMLElement).id || `group:${label}`;
    if (elements.has(fieldId)) continue;
    elements.set(fieldId, target === el ? el : group[0]!);

    // Read only after classifying: acknowledgement values are never read.
    const read = () => kind === 'dropdown' ? dropdownValue(el)
      : kind === 'radio' ? group.filter((g) => g.checked).map((g) => clean(g.labels?.[0]?.textContent)).join('; ')
      : kind === 'checkbox' ? String(input.checked)
      : kind === 'select' ? ((el as HTMLSelectElement).value ? clean((el as HTMLSelectElement).selectedOptions[0]?.text) : '')
      : kind === 'file' ? '' : (el as HTMLInputElement).value;
    fields.push({
      fieldId,
      kind,
      label,
      section,
      required: group.some((g) => g.required || g.getAttribute('aria-required') === 'true'),
      disabled: group.every((g) => g.disabled || g.readOnly),
      ...(protection && UNTOUCHABLE.has(protection) ? {} : { value: read() }),
      ...(protection ? { protection } : {}),
      ...(semantic ? { semantic } : {}),
      ...(kind === 'radio' ? { options: group.map((g) => clean(g.labels?.[0]?.textContent)) } : {}),
      ...(kind === 'select' ? { options: [...(el as HTMLSelectElement).options].map((o) => clean(o.text)).filter(Boolean) } : {}),
      ...(recordKey ? { recordKey } : {}),
      ...(!label ? { uncertain: true } : {}),
    });
  }
  return { snapshot: { stepId: 'application', stepLabel: 'Application', revision, fields, errors: [], page: { kind: 'application', sso: [] } }, elements };
}
