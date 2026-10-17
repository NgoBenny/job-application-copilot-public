// Read-only inventory of the current Workday step. Never clicks, focuses, types or dispatches events.
import { classifyProtection, UNTOUCHABLE } from '../../domain/policy';
import type { FieldKind, ScannedField, ScanSnapshot } from '../../platform/adapter';
import { pageKind } from './page-kind';
import { semanticFor } from './semantics';

const CONTROLS = 'input, textarea, select, button[aria-haspopup="listbox"], [role="combobox"]';
const SKIP_INPUT = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const RECORD = /^(workExperience|education|language|certification|website|websites)-\d+$/;
// The site's own header, menus and footer (e.g. the Settings menu on Candidate Home) are never application questions.
const SITE_CHROME = '[data-automation-id="header"], [data-automation-id="utilityButtonBar"], [data-automation-id="navigationContainer"], [data-automation-id="footerContainer"], header, footer';
const PLACEHOLDER = /^(select one|select\.{0,3}|choose\.{0,3}|--)$/i;

export type ScanResult = { snapshot: ScanSnapshot; elements: Map<string, Element> };

// Trailing "*" (required) and ":" are decoration, not wording: "Date Available:*" → "Date Available".
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim();
const textOf = (el: Element | null | undefined) => clean(el?.textContent);
const aid = (el: Element | null | undefined) => el?.getAttribute('data-automation-id') ?? '';

function visible(el: Element): boolean {
  if (el.closest('[hidden]')) return false;
  const muted = el.closest('[aria-hidden="true"]');
  // An open pop-up (e.g. the skills picker) marks the whole page aria-hidden; the fields behind it are still there (live 2026-10-17).
  const behindPopup = !!muted?.querySelector('[data-automation-id="applyFlowPage"]') && !!el.ownerDocument.querySelector('[role="dialog"]');
  if (muted && !behindPopup) return false;
  return typeof (el as HTMLElement).checkVisibility !== 'function' || (el as HTMLElement).checkVisibility();
}

const ACTIVE_STEP = '[data-automation-id="progressBarActiveStep"], [data-automation-id="progressBar"] [aria-current="step"]';
const NOT_JOB_TITLE = ':not([data-automation-id="jobTitleHeading"])';

export function stepLabel(doc: Document): string {
  const strip = (s: string) => s.replace(/^current step \d+ of \d+\s*/i, '').replace(/^step \d+( of \d+)?:?\s*/i, '');
  const active = doc.querySelector(ACTIVE_STEP);
  // The bar can show "current step 2 of 6" before its name renders; only then is an h3 trusted as the step name.
  const sources = [`[data-automation-id="applyFlowPage"] ${active ? `:is(h2, h3)${NOT_JOB_TITLE}` : `h2${NOT_JOB_TITLE}`}`, `main h2${NOT_JOB_TITLE}`, 'h1'];
  for (const label of [strip(textOf(active)), ...sources.map((s) => strip(textOf(doc.querySelector(s))))]) if (label) return label;
  return clean(doc.title);
}

/** The wrapper of one question (not a whole repeated record). */
function formField(el: Element): Element | null {
  return el.closest('[data-automation-id^="formField-"], fieldset, [role="radiogroup"]');
}

const OWN_LABEL = ':scope > label, :scope > legend, :scope > div > label, :scope > [data-automation-id="formLabel"]';

/** Explicit associations first (label[for], wrapping label, aria-labelledby), then the field wrapper's label, then ARIA/name/id. */
function labelFor(el: Element, doc: Document): string {
  const explicit = (el as HTMLInputElement).labels?.[0];
  if (explicit) return textOf(explicit);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) return clean(labelledBy.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? '').join(' '));
  const own = formField(el)?.querySelector(OWN_LABEL);
  if (own && !own.contains(el)) return textOf(own);
  return clean(el.getAttribute('aria-label')) || clean(el.getAttribute('name')) || clean(el.id);
}

/** Nearest heading of an enclosing section, without a trailing record number ("Work Experience 2" → "Work Experience"). */
function sectionOf(el: Element, root: Element): string {
  for (let a = (formField(el) ?? el).parentElement; a && a !== root.parentElement; a = a.parentElement) {
    const h = a.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > [role="heading"], :scope > header > h2, :scope > header > h3, :scope > div > h3');
    if (h && !h.contains(el)) return textOf(h).replace(/\s+\d+$/, '');
  }
  return '';
}

/** The question's own label for a group of boxes: the nearest legend/label outward, stopping at the question's field. */
function questionLabel(from: Element): string {
  for (let a: Element | null = from; a; a = a.parentElement) {
    const own = a.querySelector(':scope > legend, :scope > label');
    if (own) return textOf(own);
    if (aid(a).startsWith('formField-')) return '';
  }
  return '';
}

function recordKeyOf(el: Element): string | undefined {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const id = aid(a);
    if (RECORD.test(id)) return id;
    const lby = a.getAttribute('aria-labelledby');
    // Some tenants label the record group by an h5 elsewhere (aria-labelledby) instead of a direct child heading.
    const heading = a.getAttribute('role') === 'group' ? textOf((lby && a.ownerDocument.getElementById(lby)) || a.querySelector(':scope > h4, :scope > h3')) : '';
    // "Work Experience 1", and tenants' variants like "Work History (Optional) 1" or "Education (Required) 2" (live 2026-10-15).
    const m = heading.match(/^(work experience|work history|employment(?: history)?|education)(?:\s*\([^)]*\))?\s+(\d+)$/i);
    if (m) return `${m[1]!.toLowerCase() === 'education' ? 'education' : 'workExperience'}-${m[2]}`;
  }
  return undefined;
}

function kindOf(el: Element): FieldKind {
  if (el.closest('[data-automation-id="multiselectInputContainer"]')) return 'multiselect';
  if (el instanceof HTMLButtonElement) return 'dropdown';
  if (el.getAttribute('role') === 'combobox') return 'combobox';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLInputElement) {
    if (/dateSection(Month|Day|Year)/.test(aid(el))) return 'date';
    return ({ radio: 'radio', checkbox: 'checkbox', url: 'url', file: 'file', date: 'date', month: 'date' } as Record<string, FieldKind>)[el.type] ?? (['text', 'email', 'tel', 'number', 'search', ''].includes(el.type) ? 'text' : 'unknown');
  }
  return 'unknown';
}

function readValue(el: Element, kind: FieldKind, group: Element[]): string {
  switch (kind) {
    case 'radio': return clean(group.map((r) => r as HTMLInputElement).find((r) => r.checked)?.labels?.[0]?.textContent);
    case 'checkbox': return String((el as HTMLInputElement).checked);
    case 'select': { const s = el as HTMLSelectElement; return s.selectedIndex >= 0 && s.value !== '' ? clean(s.options[s.selectedIndex]?.text) : ''; }
    case 'dropdown': { const t = textOf(el); return PLACEHOLDER.test(t) ? '' : t; }
    case 'multiselect': return [...(el.closest('[data-automation-id="multiselectInputContainer"]')?.querySelectorAll('[data-automation-id="selectedItem"]') ?? [])].map(textOf).join('; ');
    case 'date': {
      const wrap = el.closest('[data-automation-id="dateInputWrapper"]') ?? el.parentElement!;
      const y = (wrap.querySelector('input[data-automation-id^="dateSectionYear"]') as HTMLInputElement | null)?.value ?? '';
      const m = (wrap.querySelector('input[data-automation-id^="dateSectionMonth"]') as HTMLInputElement | null)?.value ?? '';
      const d = (wrap.querySelector('input[data-automation-id^="dateSectionDay"]') as HTMLInputElement | null)?.value ?? '';
      if ((el as HTMLInputElement).type === 'month' || (el as HTMLInputElement).type === 'date') return (el as HTMLInputElement).value.slice(0, 7);
      return y ? (m ? `${y}-${m.padStart(2, '0')}${d ? `-${d.padStart(2, '0')}` : ''}` : y) : '';
    }
    default: return (el as HTMLInputElement).value ?? '';
  }
}

const VALUE_KINDS: FieldKind[] = ['text', 'url', 'textarea', 'select', 'dropdown', 'combobox'];
/** A semantic only applies to controls that can hold that kind of value (no URL into a yes/no radio). */
function fits(semantic: string, kind: FieldKind): boolean {
  if (semantic === 'skills') return kind === 'multiselect';
  if (semantic === 'resume.file') return kind === 'file';
  if (semantic.endsWith('.current')) return kind === 'checkbox';
  if (/\.(start|end)$/.test(semantic)) return kind === 'date' || kind === 'select' || kind === 'dropdown' || kind === 'text';
  return VALUE_KINDS.includes(kind) || kind === 'multiselect';
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function scanWorkday(doc: Document, revision: number): ScanResult {
  const root = doc.querySelector('[data-automation-id="applyFlowPage"]') ?? doc.body;
  const elements = new Map<string, Element>();
  const fields: ScannedField[] = [];
  const seenGroups = new Set<Element | string>();
  const page = pageKind(doc);
  // On account pages, every field (e.g. a bare "Code" box) is treated as a sign-in secret.
  const accountPage = page.kind === 'signIn' || page.kind === 'createAccount' || page.kind === 'verifyEmail';

  for (const el of root.querySelectorAll(CONTROLS)) {
    if (el instanceof HTMLInputElement && SKIP_INPUT.has(el.type)) continue;
    if (!visible(el) || el.closest(SITE_CHROME)) continue;
    // A pop-up's own search box (the narrow-layout skills picker) is not a question on the page.
    if (aid(el) === 'searchBox' && el.closest('[role="dialog"]')) continue;
    let kind = kindOf(el);
    // One field per radio group, multiselect and month/year date pair.
    let group: Element[] = [el];
    // Group identity is an element (or radio name) so separate widgets never merge.
    let groupKey: Element | string | undefined;
    let question = '';
    if (kind === 'radio') {
      const name = (el as HTMLInputElement).name;
      const container = el.closest('[role="radiogroup"], fieldset');
      group = container || name ? [...(container ?? root).querySelectorAll('input[type="radio"]')].filter((r) => !name || (r as HTMLInputElement).name === name) : [el];
      groupKey = container ?? (name ? `radio:${name}` : el);
    } else if (kind === 'checkbox' && (formField(el)?.querySelectorAll('input[type="checkbox"]').length ?? 0) > 1) {
      // Several boxes under one question (e.g. race): one choice question named by its own label, like a radio group.
      const box = formField(el)!;
      kind = 'radio';
      group = [...box.querySelectorAll('input[type="checkbox"]')];
      groupKey = box;
      // Live Workday employer 4: the legend sits on an outer fieldset, the boxes in an inner one without a label.
      question = questionLabel(box);
    } else if (kind === 'multiselect') {
      groupKey = el.closest('[data-automation-id="multiselectInputContainer"]')!;
    } else if (kind === 'date' && /dateSection/.test(aid(el))) {
      const wrap = el.closest('[data-automation-id="dateInputWrapper"]') ?? el.parentElement!;
      groupKey = wrap;
      group = [...wrap.querySelectorAll('input')];
    }
    if (groupKey && seenGroups.has(groupKey)) continue;
    if (groupKey) seenGroups.add(groupKey);

    const field = formField(el);
    // Date parts and radios are named by their wrapper, not by the "Month"/"Yes" part.
    const groupLabel = question || (kind === 'radio' || (kind === 'date' && groupKey !== undefined) ? textOf(field?.querySelector(OWN_LABEL)) : '');
    // "searchBox" is a generic widget id (the skills box and its pop-up both use it), so the question's own id names the field.
    const own = kind === 'date' && groupKey !== undefined ? '' : aid(el).replace(/-input$/, '');
    const automationId = (own === 'searchBox' ? '' : own) || aid(field).replace(/^formField-/, '');
    const label = groupLabel || labelFor(el, doc);
    const section = sectionOf(el, root);
    const recordKey = recordKeyOf(el);
    const input = el as HTMLInputElement;
    // Classified from description only, before any value is read.
    const protection = accountPage ? 'credential' as const : classifyProtection({ label, section, inputType: input.type, autocomplete: input.autocomplete });
    let semantic = protection ? undefined : semanticFor(automationId, label, recordKey, section);
    if (kind === 'file') semantic = semantic ?? (/resume|cv/i.test(label + section) ? 'resume.file' : undefined);
    if (semantic && !fits(semantic, kind)) semantic = undefined;

    const base = `${recordKey ? `${recordKey}/` : ''}${automationId || el.id || input.name || slug(label) || kind}`;
    let fieldId = base;
    for (let n = 2; elements.has(fieldId); n++) fieldId = `${base}#${n}`;
    elements.set(fieldId, el);

    fields.push({
      fieldId,
      kind,
      label,
      section,
      required: group.some((g) => (g as HTMLInputElement).required || g.getAttribute('aria-required') === 'true') || field?.querySelector('abbr[title="required"], [data-automation-id="requiredIndicator"]') != null,
      disabled: group.every((g) => (g as HTMLInputElement).disabled || g.getAttribute('aria-disabled') === 'true' || (g as HTMLInputElement).readOnly === true),
      ...(protection && UNTOUCHABLE.has(protection) ? {} : { value: readValue(el, kind, group) }),
      ...(protection ? { protection } : {}),
      ...(semantic ? { semantic } : {}),
      ...(kind === 'select' ? { options: [...(el as HTMLSelectElement).options].map((o) => clean(o.text)).filter((t) => t && !PLACEHOLDER.test(t)) } : {}),
      ...(kind === 'radio' ? { options: group.map((r) => clean((r as HTMLInputElement).labels?.[0]?.textContent)) } : {}),
      ...(recordKey ? { recordKey } : {}),
      ...(!label ? { uncertain: true } : {}),
    });
  }

  // Ties: two fields in the same place with the same label can't be told apart, so neither is trusted.
  const tie = (f: ScannedField) => `${f.section}|${f.recordKey ?? ''}|${f.label.toLowerCase()}|${f.kind}`;
  const counts = new Map<string, number>();
  for (const f of fields) counts.set(tie(f), (counts.get(tie(f)) ?? 0) + 1);
  const resolved = fields.map((f) => (counts.get(tie(f))! > 1 ? { ...f, uncertain: true, semantic: undefined } : f));

  const errors = [...new Set([...root.querySelectorAll('[data-automation-id="errorMessage"], [role="alert"]')].filter(visible).map(textOf).filter(Boolean).map((t) => t.slice(0, 200)))].slice(0, 20);
  const label = stepLabel(doc);
  return { snapshot: { stepId: slug(label) || 'unknown-step', stepLabel: label, revision, fields: resolved, errors, page }, elements };
}
