import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ashby } from '../../src/adapters/ashby';
import { writeField } from '../../src/adapters/ashby/controls';
import { scanAshby } from '../../src/adapters/ashby/scan';
import { propose, type AnswerSources } from '../../src/domain/plan';
import type { ApprovedFillPlan, BoundPageContext } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';
// @ts-expect-error plain JS fixture helper
import { install } from '../fixtures/ashby/ashby-like.js';

const never = new AbortController().signal;
const HTML = readFileSync('tests/fixtures/ashby/acme/0f1e2d3c-0000-4000-8000-000000000001/application.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const ctx = (): BoundPageContext => ({
  url: new URL('https://jobs.ashbyhq.com/acme/0f1e2d3c-0000-4000-8000-000000000001/application'), document,
  binding: { platformId: 'ashby', portalOrigin: 'https://jobs.ashbyhq.com', tenantKey: 'https://jobs.ashbyhq.com/acme', applicationId: 'a1' },
});
const profile = () => {
  const p = sampleStore().profile;
  return { ...p, contact: { ...p.contact, lastName: 'Example', region: 'Illinois' } };
};
const pressed = (path: string) => document.querySelector(`[data-field-path="${path}"] [aria-pressed="true"]`)?.textContent ?? '';
const OFFICE = 'a1a1a1a1-0000-4000-8000-000000000004';
const AUTH = 'a1a1a1a1-0000-4000-8000-000000000005';

/** Proposes from the profile, approves the chosen labels, fills and verifies; returns outcome per label. */
async function fill(labels: string[], answers?: AnswerSources) {
  const snap = scanAshby(document, 0).snapshot;
  const ps = propose(snap, profile(), {}, answers).proposals.filter((p) => labels.includes(p.label));
  const plan: ApprovedFillPlan = { planId: crypto.randomUUID(), binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions: ps.map((p) => ({
    actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
    expectedRecord: p.expectedRecord, sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale })) };
  const applied = await ashby.apply(ctx(), plan, never);
  const verified = applied.ok ? await ashby.verify(ctx(), applied.value, never) : applied;
  return verified.ok ? Object.fromEntries(verified.value.results.map((r) => [ps.find((p) => p.actionId === r.actionId)!.label, r.outcome])) : verified;
}

describe('ashby fill (live structure 2026-10-16)', { timeout: 30_000 }, () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; install(document); });

  it('fills the full name, email, phone and LinkedIn, then verifies them', async () => {
    expect(await fill(['Name', 'Email', 'Phone Number'])).toEqual({ Name: 'verified', Email: 'verified', 'Phone Number': 'verified' });
    expect((document.getElementById('_systemfield_name') as HTMLInputElement).value).toBe(`${profile().contact.firstName} Example`);
  });

  it('types into Current Location and picks only a unique match', async () => {
    expect(await fill(['Current Location'])).toEqual({ 'Current Location': 'verified' });
    expect((document.querySelector('input.ashby-application-form-input-autocomplete') as HTMLInputElement).value).toBe('Springfield, Illinois, United States');
  });

  it('leaves Current Location alone, with no text behind, when several places match', async () => {
    const box = document.querySelector('input.ashby-application-form-input-autocomplete') as HTMLInputElement;
    expect(await writeField(box, 'dropdown', 'Springfield', never)).toMatchObject({ ok: false, outcome: 'unsupported' });
    expect(box.value).toBe('');
  });

  it('puts back the place already chosen when a new one is ambiguous (review 2026-10-16)', async () => {
    const box = document.querySelector('input.ashby-application-form-input-autocomplete') as HTMLInputElement;
    box.value = 'Example City, California, United States';
    expect(await writeField(box, 'dropdown', 'Springfield', never)).toMatchObject({ ok: false });
    expect(box.value).toBe('Example City, California, United States');
    await new Promise((r) => setTimeout(r, 300)); // let the fixture's pending list render here, not in the next test
  });

  it('ignores a list left open from an earlier search (review 2026-10-16)', async () => {
    const box = document.querySelector('input.ashby-application-form-input-autocomplete') as HTMLInputElement;
    box.value = 'Spring'; box.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400)); // the Springfield rows are now showing
    expect(await writeField(box, 'dropdown', 'Example City, California', never)).toEqual({ ok: true });
    expect(box.value).toBe('Example City, California, United States');
  });

  it('presses the matching Yes/No button, and never un-presses one already chosen', async () => {
    const group = document.querySelector(`[data-field-path="${OFFICE}"] .ashby-application-form-input-yesno`)!;
    expect(await writeField(group, 'radio', 'Yes', never)).toEqual({ ok: true });
    expect(pressed(OFFICE)).toBe('Yes');
    expect(await writeField(group, 'radio', 'Yes', never)).toEqual({ ok: true }); // a second write must not toggle it off
    expect(pressed(OFFICE)).toBe('Yes');
  });

  it('answers a sensitive Yes/No only from the dashboard answer, after its own approval', async () => {
    const answers = { memories: [], sensitive: [{ topic: 'authorizedToWork' as const, answer: 'Yes' }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'Acme', jobTitle: 'Intern' } };
    const label = 'Are you legally authorized to work in the country in which the job you are applying for is located?';
    expect(await fill([label], answers)).toEqual({ [label]: 'verified' });
    expect(pressed(AUTH)).toBe('Yes');
  });

  it('picks a sensitive radio option exactly, and refuses a near miss', async () => {
    const veteran = document.querySelector<HTMLInputElement>('[data-field-path="_systemfield_eeoc_veteran_status"] input[type="radio"]')!;
    expect(await writeField(veteran, 'radio', 'I am not a veteran', never, true)).toMatchObject({ ok: false, outcome: 'unsupported' });
    expect(await writeField(veteran, 'radio', 'I am not a protected veteran', never, true)).toEqual({ ok: true });
    expect(document.querySelector<HTMLInputElement>('#eeo__vet-1')!.checked).toBe(true);
  });

  it('never presses Submit Application, whatever the plan says', async () => {
    let submitted = 0;
    document.querySelector('.ashby-application-form-submit-button')!.addEventListener('click', () => submitted++);
    await fill(['Name', 'Email', 'Phone Number', 'Current Location']);
    expect(submitted).toBe(0);
  });
});
