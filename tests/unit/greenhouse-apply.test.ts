import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { greenhouse } from '../../src/adapters/greenhouse';
import { writeField } from '../../src/adapters/greenhouse/controls';
import { scanGreenhouse } from '../../src/adapters/greenhouse/scan';
import { propose, type AnswerSources } from '../../src/domain/plan';
import type { ApprovedFillPlan, BoundPageContext } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';
// @ts-expect-error plain JS fixture helper
import { install } from '../fixtures/greenhouse/react-select-like.js';

const never = new AbortController().signal;
const HTML = readFileSync('tests/fixtures/greenhouse/acme/jobs/1001.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const ctx = (): BoundPageContext => ({
  url: new URL('https://job-boards.greenhouse.io/acme/jobs/1001'), document,
  binding: { platformId: 'greenhouse', portalOrigin: 'https://job-boards.greenhouse.io', tenantKey: 'https://job-boards.greenhouse.io/acme', applicationId: 'a1' },
});
const profile = () => {
  const p = sampleStore().profile;
  return { ...p, contact: { ...p.contact, region: 'Illinois' }, education: [{ ...p.education[0]!, degree: 'BS', start: '2021-09', end: '2025-05' }] };
};

/** Proposes from the profile, approves the chosen labels, fills and verifies; returns outcome per label. */
async function fill(labels: string[], answers?: AnswerSources) {
  const snap = scanGreenhouse(document, 0).snapshot;
  const ps = propose(snap, profile(), {}, answers).proposals.filter((p) => labels.includes(p.label));
  const plan: ApprovedFillPlan = { planId: crypto.randomUUID(), binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions: ps.map((p) => ({
    actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
    expectedRecord: p.expectedRecord, sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale })) };
  const applied = await greenhouse.apply(ctx(), plan, never);
  const verified = applied.ok ? await greenhouse.verify(ctx(), applied.value, never) : applied;
  return verified.ok ? Object.fromEntries(verified.value.results.map((r) => [ps.find((p) => p.actionId === r.actionId)!.label, r.outcome])) : verified;
}
const shown = (id: string) => document.getElementById(id)!.closest('.select__control')!.querySelector('.select__single-value')?.textContent ?? '';

describe('greenhouse fill (live structure 2026-10-12)', { timeout: 30_000 }, () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; install(document); });

  it('fills text boxes and dropdowns that ignore simple events, then verifies them', async () => {
    expect(await fill(['First Name', 'Email', 'Degree', 'End date month', 'End date year'])).toEqual({
      'First Name': 'verified', Email: 'verified', Degree: 'verified', 'End date month': 'verified', 'End date year': 'verified' });
    expect(shown('degree--0')).toBe("Bachelor's Degree");
    expect(shown('end-month--0')).toBe('May');
    expect((document.getElementById('end-year--0') as HTMLInputElement).value).toBe('2025');
  });

  it('types into searched lists (School, Location) and picks only an exact or unique match', async () => {
    expect(await fill(['School', 'Location (City)'])).toEqual({ School: 'verified', 'Location (City)': 'verified' });
    expect(shown('school--0')).toBe('Example State University');
    expect(shown('candidate-location')).toBe('Springfield, Illinois, United States');
  });

  it('leaves a searched list alone when several places match', async () => {
    const r = await writeField(document.getElementById('candidate-location')!, 'dropdown', 'Springfield', never);
    expect(r).toEqual({ ok: false, outcome: 'unsupported', reason: 'Several choices could match; pick one yourself.' });
    expect(shown('candidate-location')).toBe('');
    expect((document.getElementById('candidate-location') as HTMLInputElement).value).toBe(''); // no search text left behind
  });

  it('fills a sensitive dropdown only from a dashboard answer with an exact option, after its own approval', async () => {
    const answers = { memories: [], sensitive: [{ topic: 'veteran' as const, answer: 'I am not a protected veteran' }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'Acme', jobTitle: 'Intern' } };
    expect(await fill(['Veteran Status'], answers)).toEqual({ 'Veteran Status': 'verified' });
    expect(shown('veteran_status')).toBe('I am not a protected veteran');
    expect(await writeField(document.getElementById('gender')!, 'dropdown', 'Woman', never, true)).toMatchObject({ ok: false, outcome: 'unsupported' });
  });

  it('never writes the acknowledgement, whatever the plan claims', async () => {
    const snap = scanGreenhouse(document, 0).snapshot;
    const plan: ApprovedFillPlan = { planId: 'p', binding: ctx().binding, stepId: snap.stepId, revision: 0, actions: [{
      actionId: 'x', type: 'set', fieldId: 'question_104', kind: 'dropdown', label: 'Applicant Privacy Acknowledgement', expectedCurrent: '', proposed: 'I acknowledge', provenance: 'user', rationale: '' }] };
    const r = await greenhouse.apply(ctx(), plan, never);
    expect(r.ok && r.value.results[0]!.outcome).toBe('skipped');
    expect(shown('question_104')).toBe('');
  });

  it('picks from a dropdown the user left open, instead of closing it (review 2026-10-12)', async () => {
    const input = document.getElementById('degree--0') as HTMLInputElement;
    const control = input.closest('.select__control')!;
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50)); // the list appears a moment after the press
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(await writeField(input, 'dropdown', 'Mathematics', never)).toMatchObject({ ok: false }); // not a degree: list stays usable, no timeout
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(await writeField(input, 'dropdown', "Master's Degree", never)).toEqual({ ok: true });
    expect(shown('degree--0')).toBe("Master's Degree");
  });

  it('fills the phone Country picker from the profile country, though it shows only "+1" (live Greenhouse board 1 2026-10-12)', async () => {
    const p = profile();
    expect(await writeField(document.getElementById('country')!, 'dropdown', 'United States of America', never)).toEqual({ ok: true });
    expect(scanGreenhouse(document, 0).snapshot.fields.find((f) => f.fieldId === 'country')?.value).toBe('United States');
    // Already right: nothing to propose, whichever name the profile uses.
    const snap = scanGreenhouse(document, 0).snapshot;
    expect(propose(snap, { ...p, contact: { ...p.contact, country: 'United States of America' } }).proposals.find((x) => x.fieldId === 'country')).toBeUndefined();
  });

  it('flags Phone right after a Country change rewrote it (live Greenhouse board 1 2026-10-12)', async () => {
    const base = profile();
    const p = { ...base, contact: { ...base.contact, phone: '4085550100' } }; // 10 digits, where a country code may lead
    (document.getElementById('phone') as HTMLInputElement).value = p.contact.phone;
    await writeField(document.getElementById('country')!, 'dropdown', 'United Kingdom', never);
    expect(await writeField(document.getElementById('country')!, 'dropdown', 'United States', never)).toEqual({ ok: true });
    // The scan the side panel runs after every Fill now proposes the profile number again.
    const phone = propose(scanGreenhouse(document, 0).snapshot, p).proposals.find((x) => x.fieldId === 'phone');
    expect(phone).toMatchObject({ current: `0${p.contact.phone}`, proposed: p.contact.phone, safe: false });
  });

  it('puts one exact answer into an empty multi-answer dropdown, never a second one (live Greenhouse board 3 2026-10-13)', async () => {
    document.documentElement.innerHTML = HTML.replace('data-field="gender"', 'data-field="gender" data-multi="true"');
    install(document);
    const gender = document.getElementById('gender') as HTMLInputElement;
    expect(await writeField(gender, 'dropdown', 'Female', never, true)).toEqual({ ok: true });
    expect(gender.getAttribute('aria-expanded')).toBe('false'); // the list stays open after a pick; the extension closes it
    expect(await writeField(gender, 'dropdown', 'Male', never, true)).toMatchObject({ ok: false, outcome: 'unsupported' });
    expect([...document.querySelectorAll('.select__multi-value__label')].map((c) => c.textContent)).toEqual(['Female']);
  });

  it('matches a curly apostrophe on the page to a straight one in your answer (live Greenhouse board 3 2026-10-13)', async () => {
    document.documentElement.innerHTML = HTML.replace('I don&#39;t wish to answer', 'No, I don’t have a disability');
    install(document);
    const answers = { memories: [], sensitive: [{ topic: 'veteran' as const, answer: "No, I don't have a disability" }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'Acme', jobTitle: 'Intern' } };
    expect(await fill(['Veteran Status'], answers)).toEqual({ 'Veteran Status': 'verified' });
  });

  it('ticks one box in a checkbox group', async () => {
    expect(await writeField(document.getElementById('question_105[]_1')!, 'radio', 'Example City', never)).toEqual({ ok: true });
    expect([...document.querySelectorAll<HTMLInputElement>('fieldset.checkbox input')].map((b) => b.checked)).toEqual([false, true]);
  });

  it('presses "Add another" for a missing education entry, never Submit', async () => {
    const snap = scanGreenhouse(document, 0).snapshot;
    const plan: ApprovedFillPlan = { planId: 'p2', binding: ctx().binding, stepId: snap.stepId, revision: 0, actions: [
      { actionId: 'add', type: 'addRecord', fieldId: 'education', kind: 'unknown', label: 'Education', expectedCurrent: '', proposed: '', provenance: 'master', rationale: '' }] };
    let clicks = 0;
    document.querySelector('.add-another-button')!.addEventListener('click', () => clicks++);
    let submitted = 0;
    document.querySelector('form')!.addEventListener('submit', (e) => { submitted++; e.preventDefault(); });
    const r = await greenhouse.apply(ctx(), plan, never);
    expect(r.ok && r.value.results[0]!.outcome).toBe('attempted');
    expect([clicks, submitted]).toEqual([1, 0]);
  });
});
