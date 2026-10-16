// Writes one value into one Greenhouse control through its normal UI path; verify() checks the result.
import { exactChoice, matchOption } from '../../domain/options';
import type { FieldKind } from '../../platform/adapter';
import { optionsIn, pressKey, setNativeValue, waitFor } from '../shared/dom';
import { dropdownValue } from './scan';

import type { WriteResult } from '../shared/fill';

export type { WriteResult };

// Never pressed by the extension, whatever a plan says: submitting, uploads and anything that removes data.
const FORBIDDEN = /\b(submit|apply|delete|remove|attach|dropbox|google drive|enter manually)\b/i;

export function isForbiddenClick(el: Element): boolean {
  const b = el.closest<HTMLButtonElement>('button, a, [role="button"]');
  return !!b && (b.type === 'submit' || FORBIDDEN.test(`${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`));
}

/** React-Select ignores focus, key presses and a lone mousedown (live 2026-10-12); the full pointer sequence of a click works. */
export function press(el: HTMLElement) {
  if (isForbiddenClick(el)) throw new Error('forbidden click');
  const b = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, clientX: b.left + 5, clientY: b.top + b.height / 2, view: el.ownerDocument.defaultView };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', at));
  el.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...at, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { ...at, buttons: 0 }));
}

// Country rows end in their dialling code ("United States +1"); the name alone is what matches and what the page reports.
/**
 * Only the dropdown's own list (aria-controls), never "whichever list is open": the phone widget keeps its own
 * country list in the page (hidden, role=listbox), and React-Select's list appears a moment after the press (live 2026-10-12).
 */
const ownList = (input: HTMLInputElement) => input.ownerDocument.getElementById(input.getAttribute('aria-controls') ?? '') ?? undefined;

const texts = (rows: HTMLElement[]) => rows.map((o) => (o.textContent ?? '').trim().replace(/\s*\+\d[\d\s-]*$/, ''));
const pick = (options: string[], want: string, exact: boolean) => (exact ? exactChoice(options, want) : matchOption(options, want));

async function chooseDropdown(input: HTMLInputElement, want: string, signal: AbortSignal, exact: boolean): Promise<WriteResult> {
  const control = input.closest<HTMLElement>('.select__control');
  if (!control) return { ok: false, outcome: 'unsupported', reason: 'Unrecognized dropdown.' };
  const close = () => { if (input.value) setNativeValue(input, '', false); pressKey(input, 'Escape'); };
  // A multi-answer dropdown only ever gets one answer, and only while empty: never added to or changed.
  const multi = !!input.closest('.select__value-container--is-multi');
  if (multi && dropdownValue(input)) return { ok: false, outcome: 'unsupported', reason: 'It already has an answer; change it yourself.' };
  input.focus();
  // Pressing an open dropdown would close it (e.g. the user left it open).
  if (input.getAttribute('aria-expanded') !== 'true') press(control);
  const list = await waitFor(() => ownList(input), 3000, signal);
  if (!list) { close(); return { ok: false, outcome: 'timedOut', reason: 'The list of choices did not appear.' }; }
  let rows = optionsIn(list);
  let i = rows.length ? pick(texts(rows), want, exact) : -1;
  if (i === -1) {
    // Long or searched lists (School, Location) only show matches after typing.
    // Compared by text: React reuses row elements when it filters a list.
    const before = texts(rows).join('\n');
    setNativeValue(input, want.split('\n')[0]!, false);
    rows = (await waitFor(() => { const r = optionsIn(ownList(input) ?? list); return r.length && texts(r).join('\n') !== before ? r : undefined; }, 4000, signal)) ?? [];
    i = rows.length ? pick(texts(rows), want, exact) : -1;
  }
  if (typeof i !== 'number' || i < 0) {
    close();
    return { ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? 'Several choices could match; pick one yourself.' : 'No matching choice in the list.' };
  }
  const text = texts(rows)[i]!;
  press(rows[i]!);
  const kept = await waitFor(() => dropdownValue(input) === text, 2000, signal);
  if (multi && input.getAttribute('aria-expanded') === 'true') pressKey(input, 'Escape'); // multi lists stay open after a pick
  return kept ? { ok: true } : { ok: false, outcome: 'failed', reason: 'The site did not keep the choice.' };
}

export async function writeField(el: Element, kind: FieldKind, value: string, signal: AbortSignal, exact = false): Promise<WriteResult> {
  try {
    switch (kind) {
      case 'text': case 'url': case 'textarea':
        setNativeValue(el as HTMLInputElement, value);
        return { ok: true };
      case 'dropdown':
        return await chooseDropdown(el as HTMLInputElement, value, signal, exact);
      case 'radio': {
        // Radio or checkbox group: tick the one matching box, never untick.
        const first = el as HTMLInputElement;
        const boxes = [...(first.closest('fieldset') ?? first.parentElement!).querySelectorAll<HTMLInputElement>(`input[type="${first.type}"]`)];
        const i = pick(boxes.map((b) => (b.labels?.[0]?.textContent ?? '').trim()), value, exact);
        if (typeof i !== 'number' || i < 0) return { ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? 'Several choices could match; pick one yourself.' : 'No matching choice.' };
        if (!boxes[i]!.checked) boxes[i]!.click();
        return { ok: true };
      }
      case 'checkbox': {
        const box = el as HTMLInputElement;
        if (box.checked !== (value === 'true')) box.click();
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

/** Presses the education block's "Add another" once. */
export function addEducation(doc: Document): WriteResult {
  const button = doc.querySelector<HTMLElement>('.education--container button.add-another-button');
  if (!button || !/^\s*add another\s*$/i.test(button.textContent ?? '')) return { ok: false, outcome: 'unsupported', reason: 'No Add button found for this section.' };
  try { press(button); } catch { return { ok: false, outcome: 'skipped', reason: 'That control is never pressed automatically.' }; }
  return { ok: true };
}
