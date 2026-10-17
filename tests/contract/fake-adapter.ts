// Test-only adapter for a plain HTML form. Proves the shared engine (plan, policy, contract) has no Workday dependency.
import { classifyProtection, UNTOUCHABLE } from '../../src/domain/policy';
import { sameValue } from '../../src/domain/plan';
import type { ApplicationAdapter, ApprovedFillPlan, ScannedField } from '../../src/platform/adapter';

const plans = new Map<string, ApprovedFillPlan>();

function scanFake(doc: Document): ScannedField[] {
  return [...doc.querySelectorAll<HTMLInputElement>('input[data-label]')].map((el) => {
    const label = el.dataset.label!;
    const protection = classifyProtection({ label, section: '', inputType: el.type });
    return {
      fieldId: el.id, kind: 'text', label, section: '', required: false, disabled: false,
      ...(protection && UNTOUCHABLE.has(protection) ? {} : { value: el.value }),
      ...(protection ? { protection } : { semantic: el.dataset.semantic }),
    };
  });
}

export const fakeAdapter: ApplicationAdapter = {
  id: 'test-fake',
  async detect(ctx) {
    return { ok: true, value: ctx.url.hostname === 'jobs.fake.test' ? { status: 'supported', tenantKey: ctx.url.origin, evidence: ['fake'] } : { status: 'unsupported', evidence: [] } };
  },
  async scan(ctx) {
    return { ok: true, value: { stepId: 'form', stepLabel: 'Form', revision: 0, fields: scanFake(ctx.document), errors: [] } };
  },
  async apply(ctx, plan, signal) {
    if (plan.stepId !== 'form') return { ok: false, outcome: 'stale', reason: 'Different step.' };
    plans.set(plan.planId, plan);
    return { ok: true, value: { planId: plan.planId, results: plan.actions.map((a) => {
      if (signal.aborted) return { actionId: a.actionId, outcome: 'cancelled' as const, reason: 'Stopped.' };
      const f = scanFake(ctx.document).find((x) => x.fieldId === a.fieldId);
      if (!f || f.protection || !sameValue(f.value ?? '', a.expectedCurrent)) return { actionId: a.actionId, outcome: 'stale' as const, reason: 'Changed.' };
      ctx.document.querySelector<HTMLInputElement>(`#${a.fieldId}`)!.value = a.proposed;
      return { actionId: a.actionId, outcome: 'attempted' as const, reason: 'Written.' };
    }) } };
  },
  async verify(ctx, report) {
    const plan = plans.get(report.planId)!;
    return { ok: true, value: { planId: report.planId, results: report.results.map((r) => {
      const a = plan.actions.find((x) => x.actionId === r.actionId)!;
      if (r.outcome !== 'attempted') return { ...r, outcome: r.outcome };
      const v = ctx.document.querySelector<HTMLInputElement>(`#${a.fieldId}`)?.value ?? '';
      return { actionId: r.actionId, outcome: sameValue(v, a.proposed) ? 'verified' as const : 'failed' as const, reason: '' };
    }) } };
  },
  observeChanges() {},
};
