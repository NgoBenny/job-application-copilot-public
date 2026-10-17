// Adapter contract kit: one parameterized suite every registered adapter must pass on its fixture.
import { describe, expect, it } from 'vitest';
import { propose } from '../../src/domain/plan';
import type { ApplicationAdapter, ApprovedFillPlan, BoundPageContext } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';

export interface ContractFixture {
  url: string;
  html: string;
  /** A field the profile can fill (empty on the fixture). */
  fillableLabel: string;
  /** A protected field whose value must never be read. */
  protectedLabel: string;
}

const never = new AbortController().signal;

export function adapterContract(name: string, adapter: ApplicationAdapter, fixture: ContractFixture) {
  describe(`adapter contract: ${name}`, () => {
    const load = () => {
      document.documentElement.innerHTML = fixture.html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
      const events: string[] = [];
      for (const t of ['click', 'input', 'change', 'focus', 'keydown']) document.addEventListener(t, (e) => events.push(`${t}:${(e.target as Element).id}`), true);
      return events;
    };
    const ctx = async (): Promise<BoundPageContext> => {
      const page = { url: new URL(fixture.url), document };
      const d = await adapter.detect(page);
      if (!d.ok || !d.value.tenantKey) throw new Error('fixture not supported');
      return { ...page, binding: { platformId: adapter.id, portalOrigin: page.url.origin, tenantKey: d.value.tenantKey, applicationId: 'a1' } };
    };
    const scan = async (c: BoundPageContext) => { const r = await adapter.scan(c, never); if (!r.ok) throw new Error(r.reason); return r.value; };
    const planFor = async (c: BoundPageContext, mutate?: (p: ApprovedFillPlan) => ApprovedFillPlan) => {
      const s = await scan(c);
      const profile = { ...sampleStore().profile, contact: { ...sampleStore().profile.contact, lastName: 'Example' } };
      const proposals = propose(s, profile).proposals.filter((p) => p.label === fixture.fillableLabel);
      const plan: ApprovedFillPlan = { planId: 'p1', binding: c.binding, stepId: s.stepId, revision: s.revision,
        actions: proposals.map((p) => ({ actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed, provenance: p.provenance, rationale: p.rationale })) };
      return mutate ? mutate(plan) : plan;
    };

    it('detect and scan are read-only', async () => {
      const events = load();
      const c = await ctx();
      await scan(c);
      expect(events).toEqual([]);
    });

    it('tags a protected field and gives it no meaning to fill from', async () => {
      load();
      const s = await scan(await ctx());
      const f = s.fields.find((x) => x.label === fixture.protectedLabel)!;
      expect(f.protection).toBeDefined();
      expect(f.semantic).toBeUndefined();
    });

    it('writes only approved actions, verifies them, and is idempotent', async () => {
      load();
      const c = await ctx();
      const plan = await planFor(c);
      expect(plan.actions).toHaveLength(1);
      const before = (await scan(c)).fields.filter((f) => f.label !== fixture.fillableLabel).map((f) => f.value);
      const applied = await adapter.apply(c, plan, never);
      expect(applied.ok).toBe(true);
      const verified = await adapter.verify(c, applied.ok ? applied.value : (undefined as never), never);
      expect(verified.ok && verified.value.results.map((r) => r.outcome)).toEqual(['verified']);
      expect((await scan(c)).fields.filter((f) => f.label !== fixture.fillableLabel).map((f) => f.value)).toEqual(before);
      expect((await planFor(c)).actions).toEqual([]);
    });

    it('rejects stale actions instead of overwriting', async () => {
      load();
      const c = await ctx();
      const plan = await planFor(c, (p) => ({ ...p, actions: p.actions.map((a) => ({ ...a, expectedCurrent: 'something else' })) }));
      const r = await adapter.apply(c, plan, never);
      expect(r.ok && r.value.results.map((x) => x.outcome)).toEqual(['stale']);
    });

    it('rejects a plan for another step', async () => {
      load();
      const c = await ctx();
      const r = await adapter.apply(c, await planFor(c, (p) => ({ ...p, stepId: 'other-step' })), never);
      expect(r.ok ? 'ok' : r.outcome).toBe('stale');
    });

    it('honors cancellation', async () => {
      load();
      const c = await ctx();
      const ac = new AbortController();
      ac.abort();
      const r = await adapter.apply(c, await planFor(c), ac.signal);
      expect(r.ok && r.value.results.map((x) => x.outcome)).toEqual(['cancelled']);
    });

    it('never presses navigation or submit controls', async () => {
      const events = load();
      const c = await ctx();
      const plan = await planFor(c);
      const applied = await adapter.apply(c, plan, never);
      if (applied.ok) await adapter.verify(c, applied.value, never);
      expect(events.filter((e) => e.startsWith('click:'))).toEqual([]);
    });
  });
}
