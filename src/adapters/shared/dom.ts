// Page helpers shared by adapters: bounded waits, React-safe value writes, keys, and list lookup.

export const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
});

/** Polls until `find` returns something or the timeout passes. Bounded and cancellable. */
export async function waitFor<T>(find: () => T | undefined | null, ms: number, signal: AbortSignal): Promise<T | undefined> {
  for (let waited = 0; waited <= ms; waited += 100) {
    const v = find();
    if (v) return v;
    await sleep(100, signal);
  }
  return undefined;
}

/** React-style controlled inputs ignore `el.value = x`; the prototype setter plus input/change events updates their state. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string, blur = true) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const doc = el.ownerDocument;
  el.focus();
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (!blur) return;
  if (doc.hasFocus() && doc.activeElement === el) return el.blur();
  // Unfocused window (side panel clicked): Chrome fires no blur, and Workday commits text on blur, so send it.
  el.blur(); // silent here, but moves activeElement out: Workday's date wrapper only saves once focus has left it
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

const shown = (el: Element) => !el.closest('[hidden], [aria-hidden="true"]');

// selectedItemList: a multiselect's chosen-value pills, always visible and also role=listbox; never a dropdown's choices.
const openLists = (doc: Document) => [...doc.querySelectorAll('[role="listbox"]:not([data-automation-id="selectedItemList"])')].filter(shown);

export const optionsIn = (list: Element) => [...list.querySelectorAll<HTMLElement>('[role="option"]')].filter(shown);

/** Open lists and their rows, taken just before opening or searching: whatever is unchanged afterwards isn't the answer. */
export type ListSnapshot = ReadonlyMap<Element, ReadonlySet<Element>>;
export const snapshotLists = (doc: Document): ListSnapshot => new Map(openLists(doc).map((l) => [l, new Set(optionsIn(l))]));

/** This control's own list, or the only open list that is new or has new rows since `before` (old lists linger ~100ms). */
export function listFor(trigger: Element, before: ListSnapshot = new Map()): Element | undefined {
  const doc = trigger.ownerDocument;
  const owned = doc.getElementById(trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns') ?? '');
  const fresh = (l: Element) => { const rows = before.get(l); return !rows || !optionsIn(l).every((o) => rows.has(o)); };
  const lists = owned ? [owned] : openLists(doc).filter(fresh);
  return lists.length === 1 ? lists[0] : undefined;
}

/** Widgets (Workday, React-Select) check the legacy keyCode, which synthetic events leave at 0 unless set. Untrusted keys have no default action. */
export function pressKey(el: Element, key: 'Enter' | 'Escape') {
  const keyCode = key === 'Enter' ? 13 : 27;
  for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
}

/** Wording of a page that says the application went through (Workday; Ashby's "Your application was successfully submitted", live 2026-10-17). */
export const SUBMITTED = /\b(application (has been |was )?(successfully )?submitted|thank(s| you) for (applying|your application)|we('ve| have) received your application)\b/i;
