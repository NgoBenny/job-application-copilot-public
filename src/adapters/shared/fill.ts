// The fill lifecycle every adapter shares: page-boundary checks before each write, verification, change tracking.
// An adapter supplies only how its site scans, writes one field and adds an entry, so a safety fix lands in one place.
import { matchOption, untagged } from '../../domain/options';
import { holdsAnswer, MAX_ADDS, recordIdentityKey, sameValue } from '../../domain/plan';
import { classifyProtection, UNTOUCHABLE } from '../../domain/policy';
import type { ActionResult, ApplicationAdapter, ApprovedAction, ApprovedFillPlan, Outcome, ScannedField, ScanSnapshot } from '../../platform/adapter';
import { sleep } from './dom';

export type WriteResult = { ok: true; suggestions?: string[] } | { ok: false; outcome: Exclude<Outcome, 'verified'>; reason: string; suggestions?: string[] };

export interface SiteOps {
  scan(doc: Document, revision: number): { snapshot: ScanSnapshot; elements: Map<string, Element> };
  /** Writes one approved value (an action with a sensitiveCategory needs an exact choice). */
  write(el: Element, field: ScannedField, action: ApprovedAction, signal: AbortSignal): Promise<WriteResult>;
  /** Presses one "Add" button; `section` is the action's fieldId (e.g. "education"). */
  addRecord(doc: Document, section: string): WriteResult;
}

/** Choice controls show the option's full text (e.g. "Bachelor of Science (BS)" for "BS"). */
function holds(value: string, proposed: string, kind: string, semantic?: string) {
  // Search boxes accept any of several wordings, one per line (see Workday's pickOne).
  if (kind === 'multiselect') return proposed.split('\n').some((p) => sameValue(value, p, semantic));
  if (sameValue(value, proposed, semantic)) return true;
  return ['select', 'dropdown', 'combobox', 'radio'].includes(kind) && !!value && matchOption([value], proposed) === 0;
}

export function fillLifecycle(ops: SiteOps) {
  let revision = 0;
  // The plan being verified; verify() needs the proposed values, which the report doesn't carry.
  const plans = new Map<string, ApprovedFillPlan>();

  /** Waits until the page has been quiet for 300 ms (rerenders settled), at most 4 s. */
  async function settle(signal: AbortSignal) {
    let last = -1, quiet = 0;
    for (let t = 0; t < 4000 && quiet < 300; t += 100) {
      await sleep(100, signal).catch(() => undefined);
      if (revision === last) quiet += 100; else { quiet = 0; last = revision; }
    }
  }

  const methods: Pick<ApplicationAdapter, 'scan' | 'apply' | 'verify' | 'observeChanges'> = {
    async scan(ctx, signal) {
      if (signal.aborted) return { ok: false, outcome: 'cancelled', reason: 'Scan cancelled.' };
      return { ok: true, value: ops.scan(ctx.document, revision).snapshot };
    },
    async apply(ctx, plan, signal) {
      if (ops.scan(ctx.document, revision).snapshot.stepId !== plan.stepId) return { ok: false, outcome: 'stale', reason: 'The page moved to a different step. Scan again.' };
      plans.set(plan.planId, plan);
      // Record identities before any write, so this plan's own writes into a record don't count as a change.
      const start = ops.scan(ctx.document, revision).snapshot.fields;
      const results: ActionResult[] = [];
      let adds = 0;
      for (const a of plan.actions) {
        if (signal.aborted) { results.push({ actionId: a.actionId, outcome: 'cancelled', reason: 'Stopped before this field.' }); continue; }
        if (a.type === 'addRecord') {
          if (++adds > MAX_ADDS) { results.push({ actionId: a.actionId, outcome: 'skipped', reason: `At most ${MAX_ADDS} entries are added at a time.` }); continue; }
          const r = ops.addRecord(ctx.document, a.fieldId);
          results.push(r.ok ? { actionId: a.actionId, outcome: 'attempted', reason: 'Add pressed.' } : { actionId: a.actionId, outcome: r.outcome, reason: r.reason });
          continue;
        }
        // Re-read right before writing: rerenders replace elements, and the user may have typed since approving.
        const { snapshot, elements } = ops.scan(ctx.document, revision);
        const f = snapshot.fields.find((x) => x.fieldId === a.fieldId);
        const el = elements.get(a.fieldId);
        if (!f || !el) { results.push({ actionId: a.actionId, outcome: 'stale', reason: 'The field is no longer on the page.' }); continue; }
        // Second, independent protection check at the page boundary.
        // Credentials and attestations: never. Sensitive questions: only an action declaring that exact category (a saved sensitive answer).
        const prot = f.protection ?? classifyProtection({ label: f.label, section: f.section, inputType: (el as HTMLInputElement).type });
        if ((prot && (UNTOUCHABLE.has(prot) || a.sensitiveCategory !== prot)) || (!prot && a.sensitiveCategory) || f.uncertain || f.disabled) {
          results.push({ actionId: a.actionId, outcome: 'skipped', reason: 'Protected or ambiguous field; left for you.' });
          continue;
        }
        // The id must still name the same question (an earlier write may have re-rendered and re-numbered fields).
        if (f.label !== a.label) {
          results.push({ actionId: a.actionId, outcome: 'stale', reason: 'The page changed and this field is no longer the one you approved.' });
          continue;
        }
        if (a.expectedRecord !== undefined && f.recordKey && recordIdentityKey(start, f.recordKey) !== a.expectedRecord) {
          results.push({ actionId: a.actionId, outcome: 'stale', reason: 'The entries on the page changed order or were edited, so this entry was left as is. Scan again.' });
          continue;
        }
        if (f.kind !== a.kind || !sameValue(f.value ?? '', a.expectedCurrent)) {
          results.push({ actionId: a.actionId, outcome: 'stale', reason: 'The value changed after you approved (maybe you edited it), so it was left as is.' });
          continue;
        }
        const r = await ops.write(el, f, a, signal);
        results.push(r.ok ? { actionId: a.actionId, outcome: 'attempted', reason: 'Written; waiting to verify.' } : { actionId: a.actionId, outcome: r.outcome, reason: r.reason, ...(r.suggestions ? { suggestions: r.suggestions } : {}) });
      }
      return { ok: true, value: { planId: plan.planId, results } };
    },
    async verify(ctx, report, signal) {
      const plan = plans.get(report.planId);
      plans.delete(report.planId);
      if (!plan) return { ok: false, outcome: 'failed', reason: 'Unknown plan.' };
      await settle(signal);
      const { snapshot } = ops.scan(ctx.document, revision);
      const results = report.results.map((r) => {
        if (r.outcome !== 'attempted') return { ...r, outcome: r.outcome as Outcome };
        const a = plan.actions.find((x) => x.actionId === r.actionId)!;
        if (a.type === 'addRecord') return { actionId: r.actionId, outcome: 'verified' as const, reason: 'Entry added. Scan again to fill it.' };
        const f = snapshot.fields.find((x) => x.fieldId === a.fieldId);
        const value = f?.value ?? '';
        return f && (a.sensitiveCategory ? holdsAnswer(value, a.proposed) || holdsAnswer(untagged(value), a.proposed) : holds(value, a.proposed, f.kind, f.semantic))
          ? { actionId: r.actionId, outcome: 'verified' as const, reason: 'Filled and verified.' }
          : { actionId: r.actionId, outcome: 'failed' as const, reason: 'The site did not keep the value. Fill it by hand.' };
      });
      return { ok: true, value: { planId: plan.planId, results } };
    },
    observeChanges(ctx, onInvalidate, signal) {
      // Throttled: these sites rerender often; one notification per burst is enough.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = () => {
        revision++;
        if (!timer) timer = setTimeout(() => { timer = undefined; onInvalidate(); }, 300);
      };
      const observer = new MutationObserver(changed);
      observer.observe(ctx.document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      // Typing only bumps the revision (it never changes the step), so it doesn't trigger a step check.
      const typed = () => { revision++; };
      ctx.document.addEventListener('input', typed, { capture: true, signal });
      ctx.document.addEventListener('change', typed, { capture: true, signal });
      signal.addEventListener('abort', () => { observer.disconnect(); clearTimeout(timer); });
    },
  };
  return { ...methods, revision: () => revision };
}
