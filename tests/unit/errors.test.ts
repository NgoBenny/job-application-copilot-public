import { describe, expect, it } from 'vitest';
import { extensionError, requestError } from '../../src/browser/errors';
import { PlanSchema, Request } from '../../src/browser/messages';

describe('error text', () => {
  it('says what was too big, without values (live QA: 77 skills gave "Invalid request.")', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `Skill ${i}`, spellings: [`Skill ${i}`] }));
    const r = Request.safeParse({ type: 'tab/skills', tabId: 1, request: { binding: { platformId: 'workday', portalOrigin: 'o', tenantKey: 't', applicationId: 'a' }, fieldId: 'f', items } });
    expect(r.success).toBe(false);
    const text = requestError(r.error!);
    expect(text).toBe('Too much at once: request.items allows at most 50. Try fewer at a time.');
    expect(text).not.toContain('Skill');
  });

  it('accepts a fill for a question that runs to a long paragraph (live QA 2026-10-12)', () => {
    const action = { actionId: 'a', type: 'set', fieldId: 'f', kind: 'radio', label: 'x'.repeat(1500), expectedCurrent: '', proposed: 'No', provenance: 'user', rationale: '' };
    const plan = { planId: 'p', binding: { platformId: 'workday', portalOrigin: 'o', tenantKey: 't', applicationId: 'a' }, stepId: 's', revision: 0, actions: [action] };
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it('explains a page that lost its connection', () => {
    expect(extensionError(new Error('Could not establish connection. Receiving end does not exist.'))).toMatch(/Reload the page, then activate/);
    expect(extensionError(new Error('boom'))).toBe('Something went wrong in the extension. Reload the page and try again.');
  });
});
