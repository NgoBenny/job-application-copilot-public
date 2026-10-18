// Read-only inventory of an Ashby application form (jobs.ashbyhq.com). One page; every question is a field-entry block.
import { classifyProtection, UNTOUCHABLE } from '../../domain/policy';
import type { FieldKind, ScannedField, ScanSnapshot } from '../../platform/adapter';
import { SUBMITTED } from '../shared/dom';

/** After Submit, Ashby swaps the form for a success message on the same page. */
export const submitted = (doc: Document) => !doc.querySelector('[data-field-path]') && SUBMITTED.test(doc.body?.textContent ?? '');

export type ScanResult = { snapshot: ScanSnapshot; elements: Map<string, Element> };

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim();

// Ashby's system fields keep stable paths; custom questions (random ids) are known by their title.
const BY_PATH: Record<string, string> = {
  _systemfield_name: 'contact.fullName', _systemfield_email: 'contact.email', _systemfield_phone: 'contact.phone',
  _systemfield_location: 'contact.location', _systemfield_resume: 'resume.file',
};
// Link and phone rules fit text boxes only; "Current Location" is a place search box.
const TEXT_RULES: [RegExp, string][] = [[/^((mobile|cell) )?phone( number)?( \(.*\))?$|^mobile( number)?$/i, 'contact.phone'], [/linkedin/i, 'links.linkedin'], [/github/i, 'links.github'], [/^(personal )?(website|portfolio)( url)?$/i, 'links.portfolio']];
const PLACE_RULE = /^(current )?(location|city)$/i;

/** The one control a question block holds, its kind, how to read it, and its choices. */
function controlOf(entry: Element): { kind: FieldKind; el: Element; read: () => string; options?: string[] } | undefined {
  const yesno = entry.querySelector('.ashby-application-form-input-yesno');
  if (yesno) {
    const buttons = [...yesno.querySelectorAll<HTMLElement>('button[data-option]')];
    return { kind: 'radio', el: yesno, options: buttons.map((b) => clean(b.textContent)), read: () => clean(buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent) };
  }
  const label = (i: HTMLInputElement) => clean(i.labels?.[0]?.textContent);
  const radios = [...entry.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const boxes = [...entry.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  // Several radios or boxes under one question: one choice field, like a radio group.
  const group = radios.length ? radios : boxes.length > 1 ? boxes : [];
  if (group.length) return { kind: 'radio', el: group[0]!, options: group.map(label), read: () => group.filter((g) => g.checked).map(label).join('; ') };
  if (boxes.length === 1) return { kind: 'checkbox', el: boxes[0]!, read: () => String(boxes[0]!.checked) };
  const combo = entry.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (combo) return { kind: 'dropdown', el: combo, read: () => combo.value };
  const select = entry.querySelector('select');
  if (select) return { kind: 'select', el: select, options: [...select.options].map((o) => clean(o.text)).filter(Boolean), read: () => (select.value ? clean(select.options[select.selectedIndex]?.text) : '') };
  const box = entry.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input:not([type="hidden"])');
  if (!box) return undefined;
  const kind: FieldKind = box instanceof HTMLTextAreaElement ? 'textarea' : box.type === 'file' ? 'file' : box.type === 'url' ? 'url' : 'text';
  return { kind, el: box, read: () => (kind === 'file' ? '' : box.value) };
}

export function scanAshby(doc: Document, revision: number): ScanResult {
  const elements = new Map<string, Element>();
  const fields: ScannedField[] = [];
  const headings = [...doc.querySelectorAll('h1, h2, h3')];

  // Question blocks carry data-field-path; the equal-opportunity survey's blocks lack the field-entry class (live 2026-10-16).
  for (const entry of [...doc.querySelectorAll('[data-field-path]')].filter((e) => e.querySelector('.ashby-application-form-question-title'))) {
    const c = controlOf(entry);
    const fieldId = entry.getAttribute('data-field-path') ?? '';
    if (!c || !fieldId || elements.has(fieldId)) continue;
    elements.set(fieldId, c.el);
    const label = clean(entry.querySelector('.ashby-application-form-question-title')?.textContent);
    // The last heading before the question, e.g. an equal-opportunity block's title.
    const section = clean(headings.filter((h) => h.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.textContent);
    const protection = classifyProtection({ label, section, inputType: (c.el as HTMLInputElement).type });
    const byTitle = c.kind === 'text' || c.kind === 'url' ? TEXT_RULES.find(([re]) => re.test(label))?.[1] : c.kind === 'dropdown' && PLACE_RULE.test(label) ? 'contact.location' : undefined;
    const semantic = protection ? undefined : BY_PATH[fieldId] ?? byTitle;
    const controls = [...entry.querySelectorAll('input, textarea, select')];
    fields.push({
      fieldId,
      kind: c.kind,
      label,
      section,
      required: controls.some((x) => (x as HTMLInputElement).required || x.getAttribute('aria-required') === 'true'),
      disabled: controls.length > 0 && controls.every((x) => (x as HTMLInputElement).disabled),
      // Read only after classifying: acknowledgement values are never read.
      ...(protection && UNTOUCHABLE.has(protection) ? {} : { value: c.read() }),
      ...(protection ? { protection } : {}),
      ...(semantic ? { semantic } : {}),
      ...(c.options ? { options: c.options } : {}),
      ...(!label ? { uncertain: true } : {}),
    });
  }
  return { snapshot: { stepId: 'application', stepLabel: 'Application', revision, fields, errors: [], page: { kind: submitted(doc) ? 'confirmation' : 'application', sso: [] } }, elements };
}
