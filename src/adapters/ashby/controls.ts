// Writes one value into one Ashby control through its normal UI path; verify() checks the result.
import { exactChoice, matchOption } from '../../domain/options';
import type { FieldKind } from '../../platform/adapter';
import { optionsIn, pressKey, setNativeValue, waitFor } from '../shared/dom';
import type { WriteResult } from '../shared/fill';

// Never pressed, whatever a plan says. Ashby's Yes/No buttons are type="submit" too, so this goes by the button's words.
const FORBIDDEN = /\b(submit|apply|upload|delete|remove|autofill)\b/i;

export function isForbiddenClick(el: Element): boolean {
  const b = el.closest('button, a, [role="button"]');
  return !!b && FORBIDDEN.test(`${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`);
}

function click(el: HTMLElement) {
  if (isForbiddenClick(el)) throw new Error('forbidden click');
  el.click();
}

const pick = (options: string[], want: string, exact: boolean) => (exact ? exactChoice(options, want) : matchOption(options, want));
const noMatch = (i: number | 'ambiguous'): WriteResult => ({ ok: false, outcome: 'unsupported', reason: i === 'ambiguous' ? 'Several choices could match; pick one yourself.' : 'No matching choice.' });

/** Place search: type, wait for this box's own list (aria-controls), click only an exact or unique match. */
async function choosePlace(input: HTMLInputElement, want: string, signal: AbortSignal, exact: boolean): Promise<WriteResult> {
  const ownList = () => input.ownerDocument.getElementById(input.getAttribute('aria-controls') ?? '') ?? undefined;
  const rowsNow = () => optionsIn(ownList() ?? input.ownerDocument.createElement('div'));
  // The box itself holds the chosen place, so a failed attempt puts back what was there instead of emptying it.
  const before = input.value;
  const clear = () => { setNativeValue(input, before, false); pressKey(input, 'Escape'); };
  const stale = rowsNow().map((o) => o.textContent).join('\n');
  setNativeValue(input, want.split('\n')[0]!, false);
  // Only rows rendered for this search count: a list left open from an earlier search is ignored.
  const rows = await waitFor(() => { const r = rowsNow(); return r.length && r.map((o) => o.textContent).join('\n') !== stale ? r : undefined; }, 4000, signal);
  if (!rows) { clear(); return { ok: false, outcome: 'timedOut', reason: 'No places were suggested for this text.' }; }
  const texts = rows.map((o) => (o.textContent ?? '').trim());
  const i = pick(texts, want, exact);
  if (typeof i !== 'number' || i < 0) { clear(); return noMatch(i); }
  click(rows[i]!);
  return (await waitFor(() => input.value === texts[i], 2000, signal)) ? { ok: true } : { ok: false, outcome: 'failed', reason: 'The site did not keep the choice.' };
}

export async function writeField(el: Element, kind: FieldKind, value: string, signal: AbortSignal, exact = false): Promise<WriteResult> {
  try {
    switch (kind) {
      case 'text': case 'url': case 'textarea':
        setNativeValue(el as HTMLInputElement, value);
        return { ok: true };
      case 'dropdown':
        return await choosePlace(el as HTMLInputElement, value, signal, exact);
      case 'radio': {
        // Yes/No buttons: pressing the already-pressed one would un-press it (live 2026-10-16), so it is left alone.
        if (el.classList.contains('ashby-application-form-input-yesno')) {
          const buttons = [...el.querySelectorAll<HTMLElement>('button[data-option]')];
          const i = pick(buttons.map((b) => (b.textContent ?? '').trim()), value, exact);
          if (typeof i !== 'number' || i < 0) return noMatch(i);
          if (buttons[i]!.getAttribute('aria-pressed') !== 'true') click(buttons[i]!);
          return { ok: true };
        }
        // Radio or checkbox group: tick the one matching box, never untick.
        const first = el as HTMLInputElement;
        const boxes = [...(first.closest('fieldset, .ashby-application-form-field-entry') ?? first.parentElement!).querySelectorAll<HTMLInputElement>(`input[type="${first.type}"]`)];
        const i = pick(boxes.map((b) => (b.labels?.[0]?.textContent ?? '').trim()), value, exact);
        if (typeof i !== 'number' || i < 0) return noMatch(i);
        if (!boxes[i]!.checked) click(boxes[i]!);
        return { ok: true };
      }
      case 'checkbox': {
        const box = el as HTMLInputElement;
        if (box.checked !== (value === 'true')) click(box);
        return { ok: true };
      }
      case 'select': {
        const s = el as HTMLSelectElement;
        const i = pick([...s.options].map((o) => o.text), value, exact);
        if (typeof i !== 'number' || i < 0) return noMatch(i);
        s.selectedIndex = i;
        s.dispatchEvent(new Event('change', { bubbles: true }));
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
