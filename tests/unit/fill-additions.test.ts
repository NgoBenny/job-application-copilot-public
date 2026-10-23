import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillLifecycle } from '../../src/adapters/shared/fill';
import type { ApprovedFillPlan, BoundPageContext, ScannedField } from '../../src/platform/adapter';

const ctx: BoundPageContext = {
  document, url: new URL('https://example.test/apply'),
  binding: { platformId: 'test-fake', portalOrigin: 'https://example.test', tenantKey: 'https://example.test', applicationId: 'a1' },
};
const record = (key: string): ScannedField => ({ fieldId: `${key}-school`, recordKey: key, label: 'School', section: 'Experience', kind: 'text', value: '', required: false, disabled: false });

describe('verification of added records', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['ignored click', [], ['failed', 'failed']],
    ['one new record for two clicks', ['education-2'], ['verified', 'failed']],
    ['two new records', ['education-2', 'education-3'], ['verified', 'verified']],
    ['a record in another section', ['workExperience-2'], ['failed', 'failed']],
  ])('%s', async (_name, added, expected) => {
    vi.useFakeTimers();
    let fields = [record('education-1')];
    const fill = fillLifecycle({
      scan: () => ({ snapshot: { stepId: 'experience', stepLabel: 'Experience', revision: 0, fields, errors: [] }, elements: new Map() }),
      write: async () => ({ ok: true }), addRecord: () => ({ ok: true }),
    });
    const plan: ApprovedFillPlan = {
      planId: 'add-plan', binding: ctx.binding, stepId: 'experience', revision: 0,
      actions: [1, 2].map((n) => ({ actionId: `add-${n}`, type: 'addRecord', fieldId: 'education', label: 'Add education', kind: 'unknown', expectedCurrent: '', proposed: 'Example School', provenance: 'master', rationale: '' })),
    };
    const applied = await fill.apply(ctx, plan, new AbortController().signal);
    if (!applied.ok) throw new Error(applied.reason);
    fields = [...fields, ...added.map(record)];
    const verification = fill.verify(ctx, applied.value, new AbortController().signal);
    await vi.runAllTimersAsync();
    const result = await verification;
    expect(result.ok && result.value.results.map((r) => r.outcome)).toEqual(expected);
  });
});
