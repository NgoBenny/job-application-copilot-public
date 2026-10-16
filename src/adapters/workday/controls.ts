// Writes one value into one Workday control through its normal UI path, then leaves verification to verify().
// Synthetic events are not trusted user events; anything that doesn't take the value is reported, not forced.
import { exactChoice, matchOption } from '../../domain/options';
import type { FieldKind } from '../../platform/adapter';
import { listFor, optionsIn, pressKey, setNativeValue, sleep, snapshotLists, waitFor, type ListSnapshot } from '../shared/dom';

export { listFor, optionsIn, pressKey, setNativeValue, sleep, snapshotLists, waitFor, type ListSnapshot };

import type { WriteResult } from '../shared/fill';

export type { WriteResult };

// Never pressed by the extension, whatever a plan says.
const FORBIDDEN_TEXT = /\b(next|submit|continue|apply|sign ?in|log ?in|create account|register|agree|accept|i certify|review|back|delete|remove|save and continue|finish)\b/i;
const FORBIDDEN_ID = /^(bottom-navigation|pageFooter|submit|utilityButton|createAccount|signIn|delete|remove)/i;

export function isForbiddenClick(el: Element): boolean {
  const target = el.closest('button, a, [role="button"]');
  if (!target) return false;
  // A list row is a choice (e.g. "Next.js" inside a button-like list), unless the button itself sits inside the row.
  const row = el.closest('[role="option"]');
  if (row && !row.contains(target)) return false;
  const text = `${target.textContent ?? ''} ${target.getAttribute('aria-label') ?? ''}`;
  return FORBIDDEN_TEXT.test(text) || FORBIDDEN_ID.test(target.getAttribute('data-automation-id') ?? '');
}

function click(el: HTMLElement) {
  if (isForbiddenClick(el)) throw new Error('forbidden click');
  el.click();
}

/** Some option rows have no click handler; Workday's inner promptLeafNode does, and clicks don't travel down to it. */
export function clickOption(option: HTMLElement) {
  click(option.querySelector<HTMLElement>('[data-automation-id="promptLeafNode"]') ?? option);
}

function optionsFor(trigger: HTMLElement, before: ListSnapshot): HTMLElement[] | undefined {
  const list = listFor(trigger, before);
  const opts = list ? optionsIn(list) : [];
  return opts.length ? opts : undefined;
}

const closeList = (trigger: HTMLElement) => pressKey(trigger, 'Escape');

async function chooseOption(trigger: HTMLElement, want: string, signal: AbortSignal, exact: boolean, before: ListSnapshot): Promise<WriteResult> {
  const options = await waitFor(() => optionsFor(trigger, before), 3000, signal);
  if (!options) { closeList(trigger); return { ok: false, outcome: 'timedOut', reason: 'The list of choices did not appear.' }; }
  const i = pick(options.map((o) => o.textContent ?? ''), want, exact);
  if (typeof i !== 'number' || i < 0) {
    closeList(trigger);
    return { ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? AMBIGUOUS : 'No matching choice in the list.' };
  }
  clickOption(options[i]!);
  return { ok: true };
}

const AMBIGUOUS = 'Several choices could match; pick one yourself.';

/** Exact mode (sensitive answers) accepts only an option whose text equals the answer. */
function pick(options: string[], want: string, exact: boolean): number | 'ambiguous' {
  return exact ? exactChoice(options, want) : matchOption(options, want);
}

export async function writeField(el: Element, kind: FieldKind, value: string, signal: AbortSignal, exact = false): Promise<WriteResult> {
  try {
    switch (kind) {
      case 'text': case 'url': case 'textarea':
        setNativeValue(el as HTMLInputElement, value);
        return { ok: true };
      case 'select': {
        const s = el as HTMLSelectElement;
        const i = pick([...s.options].map((o) => o.text), value, exact);
        if (typeof i !== 'number' || i < 0) return { ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? AMBIGUOUS : 'No matching choice in the list.' };
        s.selectedIndex = i;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }
      case 'radio': {
        // Checkbox groups (one question, several boxes) are written like radios: tick the one matching box, never untick.
        const { name, type } = el as HTMLInputElement;
        const container = el.closest(type === 'checkbox' ? '[data-automation-id^="formField-"], fieldset' : '[role="radiogroup"], fieldset') ?? el.parentElement!;
        const radios = [...container.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)].filter((r) => type === 'checkbox' || !name || r.name === name);
        const i = pick(radios.map((r) => r.labels?.[0]?.textContent ?? ''), value, exact);
        if (typeof i !== 'number' || i < 0) return { ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? AMBIGUOUS : 'No matching choice.' };
        if (!radios[i]!.checked) click(radios[i]!);
        return { ok: true };
      }
      case 'checkbox': {
        const box = el as HTMLInputElement;
        if (box.checked !== (value === 'true')) click(box);
        return { ok: true };
      }
      case 'dropdown': {
        const before = snapshotLists(el.ownerDocument);
        click(el as HTMLElement);
        return await chooseOption(el as HTMLElement, value, signal, exact, before);
      }
      case 'combobox': {
        const input = el as HTMLInputElement;
        const before = input.value;
        const lists = snapshotLists(input.ownerDocument);
        let r: WriteResult = { ok: false, outcome: 'cancelled', reason: 'Stopped.' };
        try {
          setNativeValue(input, value, false);
          r = await chooseOption(input, value, signal, false, lists);
          return r;
        } finally {
          if (!r.ok) setNativeValue(input, before); // don't leave half-typed search text behind, even when stopped
        }
      }
      case 'date': {
        // input only: some tenants put a dateSectionMonth-display div before each input.
        const wrap = el.closest('[data-automation-id="dateInputWrapper"]') ?? el.parentElement!;
        const year = wrap.querySelector<HTMLInputElement>('input[data-automation-id^="dateSectionYear"]');
        const month = wrap.querySelector<HTMLInputElement>('input[data-automation-id^="dateSectionMonth"]');
        if (!year && (el as HTMLInputElement).type === 'month') { setNativeValue(el as HTMLInputElement, value); return { ok: true }; }
        if (!year) return { ok: false, outcome: 'unsupported', reason: 'Unrecognized date control.' };
        const day = wrap.querySelector<HTMLInputElement>('input[data-automation-id^="dateSectionDay"]');
        const [y, m, d] = value.split('-');
        if (m && month) setNativeValue(month, m, false); // one blur after the year: a partly entered date gets saved mangled
        if (d && day) setNativeValue(day, d, false);
        setNativeValue(year, y!);
        return { ok: true };
      }
      default:
        return { ok: false, outcome: 'unsupported', reason: 'This kind of field is filled by hand.' };
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, outcome: 'cancelled', reason: 'Stopped.' };
    if ((e as Error).message === 'forbidden click') return { ok: false, outcome: 'skipped', reason: 'That control is never pressed automatically.' };
    return { ok: false, outcome: 'failed', reason: 'The field could not be changed.' };
  }
}

/** Presses a section's "Add" button once. Only buttons whose text is an Add command qualify. */
export function addRecord(doc: Document, section: 'workExperience' | 'education'): WriteResult {
  const heading = section === 'workExperience' ? /work (experience|history)|employment/i : /education/i;
  const container = doc.querySelector(`[data-automation-id="${section}Section"]`)
    ?? [...doc.querySelectorAll('section, [role="group"], div')].find((s) => heading.test(s.querySelector(':scope > h4, :scope > h3, :scope > h2')?.textContent ?? ''));
  const button = container && [...container.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .find((b) => /^\s*add(\s+another)?\b/i.test(b.textContent ?? '') || /^add\b/i.test(b.getAttribute('aria-label') ?? '') || b.getAttribute('data-automation-id') === 'add-button');
  if (!button) return { ok: false, outcome: 'unsupported', reason: 'No Add button found for this section.' };
  try { click(button); } catch { return { ok: false, outcome: 'skipped', reason: 'That control is never pressed automatically.' }; }
  return { ok: true };
}
