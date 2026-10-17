// Workday search-and-pick boxes (Skills, Field of Study): search, select only exact matches, report everything else honestly.
import { chipIsSkill, decideSkill, relatedSkill, skillKey } from '../../domain/skills';
import type { SkillOutcome, SkillRequestItem } from '../../platform/adapter';
import { nameKey } from '../../domain/text';
import { clickOption, listFor, optionsIn, pressKey, setNativeValue, sleep, snapshotLists, waitFor, type WriteResult } from './controls';

const RATE_LIMIT_MS = 400;
const ANSWER_MS = 4000;
const NO_RESULTS = /^(no items\.?|no results( found)?\.?|no matches( found)?\.?|no options\.?)$/i;

type Answer = { options: HTMLElement[] } | { chip: string } | 'none' | 'timeout';

/** Types one query and waits for this field's own list to answer: options, a confirmed "no results", or nothing. */
async function query(input: HTMLInputElement, q: string, signal: AbortSignal, chips?: () => string[]): Promise<Answer> {
  // The previous query's rows can stay up for a while after the box empties; only rows rendered after this search count.
  const before = snapshotLists(input.ownerDocument);
  setNativeValue(input, q, false); // stay focused: search boxes often clear on blur
  pressKey(input, 'Enter'); // some tenants search only on Enter
  const answer = await waitFor<Answer>(() => {
    // Some tenants empty the box once they search; other text means a newer query, so its list isn't ours.
    if (input.value && input.value !== q) return undefined;
    // Single-choice boxes pick a lone result by themselves on Enter, without showing a list.
    const picked = chips?.()[0];
    if (picked) return { chip: picked };
    const list = listFor(input, before);
    if (!list) return undefined;
    const options = optionsIn(list);
    // A list with nothing related to this query may still be the previous query's results; keep waiting.
    if (options.some((o) => skillKey(o.textContent ?? '') === skillKey(q) || relatedSkill(o.textContent ?? '', q))) return { options };
    return NO_RESULTS.test((list.textContent ?? '').trim()) ? 'none' : undefined;
  }, ANSWER_MS, signal);
  return answer ?? 'timeout';
}

/** Narrow layouts open a pop-up with its own search box; typing into the hidden original box then does nothing (live 2026-10-17). */
const typingBox = (input: HTMLInputElement) => input.ownerDocument.querySelector<HTMLInputElement>('[role="dialog"] input[data-automation-id="searchBox"]') ?? input;

export async function searchSkills(input: HTMLInputElement, items: readonly SkillRequestItem[], signal: AbortSignal): Promise<SkillOutcome[]> {
  const container = input.closest('[data-automation-id="multiselectInputContainer"]') ?? input.parentElement!;
  const chips = () => [...container.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => (c.textContent ?? '').trim());
  const out: SkillOutcome[] = [];
  // Some tenants cap the box (live Workday employer 5: 25). Two skills in a row with no answer and no new chip mean it is full; stop instead of waiting on every one.
  let stuck = 0;
  for (const item of items) {
    if (signal.aborted) { out.push({ name: item.name, status: 'cancelled' }); continue; }
    if (stuck >= 2) { out.push({ name: item.name, status: 'full' }); continue; }
    const count = chips().length;
    const wanted = item.option ? [item.option] : item.spellings;
    // Includes chips the site pre-filled as "(Suggested)", so a skill is never added twice (live 2026-10-16).
    const already = chips().find((c) => wanted.some((w) => chipIsSkill(c, w)));
    if (already) { out.push({ name: item.name, status: 'alreadySelected', option: already }); continue; }

    const suggestions = new Set<string>();
    let timedOut = false;
    let result: SkillOutcome | undefined;
    const before = new Set(chips());
    try {
      for (const q of wanted) {
        // Free-entry boxes (live Workday employer 5) add the typed skill on Enter and show its row ticked: clicking that row would untick it.
        const answer = await query(typingBox(input), q, signal, () => chips().filter((c) => !before.has(c) && skillKey(c) === skillKey(q)));
        if (answer === 'timeout') { timedOut = true; continue; }
        if (typeof answer === 'object' && 'chip' in answer) { result = { name: item.name, status: 'added', option: answer.chip }; break; }
        if (answer !== 'none' && 'options' in answer) {
          const texts = answer.options.map((o) => (o.textContent ?? '').trim());
          const d = item.option ? (texts.findIndex((t) => t === item.option) >= 0 ? { pick: texts.indexOf(item.option) } : { none: true as const }) : decideSkill(texts, q);
          if ('pick' in d) {
            const text = texts[d.pick]!;
            const kept = () => chips().find((c) => c === text);
            // Rows toggle: never click one whose skill already arrived (e.g. added by Enter just after the list showed).
            let chip = kept();
            if (!chip) { clickOption(answer.options[d.pick]!); chip = await waitFor(kept, 2000, signal); }
            // Live Workday sometimes ignores a click on fresh results (a second try works), so search and click once more.
            if (!chip) {
              const again = await query(typingBox(input), q, signal);
              const row = typeof again === 'object' && 'options' in again ? again.options.find((o) => (o.textContent ?? '').trim() === text) : undefined;
              // Rows toggle: a slow first click that landed meanwhile must not be undone.
              if (row && !kept()) { clickOption(row); chip = await waitFor(kept, 2000, signal); } else chip = kept();
            }
            result = chip ? { name: item.name, status: 'added', option: text } : { name: item.name, status: 'failed' };
            break;
          }
          if ('suggestions' in d) d.suggestions.forEach((s) => suggestions.add(s));
        }
        await sleep(RATE_LIMIT_MS, signal);
      }
    } catch {
      result = { name: item.name, status: 'cancelled' };
    } finally {
      const box = typingBox(input);
      if (box.value) setNativeValue(box, '', box !== input); // never leave search text behind (the pop-up box stays focused)
    }
    const outcome: SkillOutcome = result ?? (suggestions.size ? { name: item.name, status: 'suggestions', suggestions: [...suggestions] }
      : { name: item.name, status: timedOut ? 'timedOut' : 'notAvailable' });
    stuck = (outcome.status === 'timedOut' || outcome.status === 'failed') && count > 0 && chips().length === count ? stuck + 1 : 0;
    out.push(outcome);
    if (stuck === 2) out.splice(-2, 2, ...out.slice(-2).map((o) => ({ name: o.name, status: 'full' as const })));
    if (!signal.aborted) await sleep(RATE_LIMIT_MS, signal).catch(() => undefined);
  }
  return out;
}

// Same name only: "Computer Science" must never pick "Computer Science Education".
const sameChoice = (a: string, b: string) => nameKey(a) !== '' && nameKey(a) === nameKey(b);
const chipsIn = (container: Element) => [...container.querySelectorAll('[data-automation-id="selectedItem"]')].map((c) => (c.textContent ?? '').trim());

/**
 * A single-choice search box (e.g. Field of Study): pick the one matching option; offer similar ones; undo a wrong auto-pick.
 * `want` may hold several accepted wordings, one per line (the profile value, then choices you kept or used before), tried in order.
 */
export async function pickOne(input: HTMLInputElement, want: string, signal: AbortSignal): Promise<WriteResult & { suggestions?: string[] }> {
  const container = input.closest('[data-automation-id="multiselectInputContainer"]') ?? input.parentElement!;
  const chips = () => chipsIn(container);
  const wants = want.split('\n');
  const accepted = (t: string) => wants.some((w) => sameChoice(t, w));
  const current = chips();
  if (current.some(accepted)) return { ok: true };
  if (current.length) return { ok: false, outcome: 'unsupported', reason: 'It already has a different choice; change it yourself.' };
  const similar = new Set<string>();
  let timedOut = false;
  try {
    for (const [n, w] of wants.entries()) {
      if (n > 0) await sleep(RATE_LIMIT_MS, signal);
      // Nested menus name a choice by its path ("Job Board: LinkedIn"); search finds it by its own name, the pick still needs the whole text.
      const answer = await query(input, w.split(': ').pop()!, signal, chips);
      if (answer === 'timeout') { timedOut = true; continue; }
      if (answer === 'none') continue;
      if ('chip' in answer) {
        if (accepted(answer.chip)) return { ok: true };
        // Never leave a value nobody approved: remove the site's own pick and offer it instead.
        const del = container.querySelector<HTMLElement>('[data-automation-id="selectedItem"] [data-automation-id="DELETE_charm"]');
        del?.click();
        const removed = await waitFor(() => (chips().length ? undefined : true), 2000, signal);
        if (!removed) return { ok: false, outcome: 'failed', reason: `The site chose "${answer.chip}" on its own and it could not be removed. Check it.` };
        similar.add(answer.chip);
        continue;
      }
      const texts = answer.options.map((o) => (o.textContent ?? '').trim());
      // Earlier wordings win (the profile's own first); several rows with one name stay ambiguous.
      const matching = (ok: (t: string) => boolean) => texts.flatMap((t, i) => (ok(t) ? [i] : []));
      const own = matching((t) => sameChoice(t, w));
      const hits = own.length ? own : matching(accepted);
      if (hits.length > 1) { pressKey(input, 'Escape'); return { ok: false, outcome: 'unsupported', reason: 'Several choices could match.' }; }
      if (hits.length === 1) {
        const i = hits[0]!;
        clickOption(answer.options[i]!);
        const chip = await waitFor(() => chips().find((c) => c === texts[i]), 2000, signal);
        return chip ? { ok: true } : { ok: false, outcome: 'failed', reason: 'The site did not keep the choice.' };
      }
      pressKey(input, 'Escape');
      texts.filter((t) => relatedSkill(t, w)).forEach((t) => similar.add(t));
    }
    if (similar.size) return { ok: false, outcome: 'unsupported', reason: similar.size === 1 ? `Only a similar choice exists: "${[...similar][0]}".` : 'Only similar choices exist.', suggestions: [...similar].slice(0, 5) };
    return timedOut ? { ok: false, outcome: 'timedOut', reason: 'No clear answer from the site; pick it yourself.' } : { ok: false, outcome: 'unsupported', reason: 'No matching choice in the list.' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, outcome: 'cancelled', reason: 'Stopped.' };
    return { ok: false, outcome: 'failed', reason: 'The field could not be changed.' };
  } finally {
    if (input.value) setNativeValue(input, ''); // never leave search text behind
  }
}

