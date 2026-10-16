import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workday } from '../../src/adapters/workday';
import { addRecord, isForbiddenClick, listFor, writeField } from '../../src/adapters/workday/controls';
import { scanWorkday } from '../../src/adapters/workday/scan';
import { MAX_ADDS, propose } from '../../src/domain/plan';
import type { ApprovedAction, ApprovedFillPlan, BoundPageContext } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';

const never = new AbortController().signal;
const GLOBEX = readFileSync('tests/fixtures/workday/globex/Careers/apply/my-experience.html', 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
const ctx = (): BoundPageContext => ({
  url: new URL('https://globex.wd5.myworkdayjobs.com/Careers/apply'), document,
  binding: { platformId: 'workday', portalOrigin: 'https://globex.wd5.myworkdayjobs.com', tenantKey: 'https://globex.wd5.myworkdayjobs.com/Careers', applicationId: 'a1' },
});

function planFrom(filter: (a: ApprovedAction) => boolean, edit: (a: ApprovedAction) => ApprovedAction = (a) => a): ApprovedFillPlan {
  const snap = scanWorkday(document, 0).snapshot;
  const actions = propose(snap, sampleStore().profile).proposals.map((p) => ({
    actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
    expectedRecord: p.expectedRecord, provenance: p.provenance, rationale: p.rationale,
  })).filter(filter).map(edit);
  return { planId: crypto.randomUUID(), binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions };
}
const outcomes = async (plan: ApprovedFillPlan) => { const r = await workday.apply(ctx(), plan, never); return r.ok ? r.value.results.map((x) => x.outcome) : [r.outcome]; };

describe('workday apply guards', () => {
  beforeEach(() => { document.documentElement.innerHTML = GLOBEX; });

  it('refuses a write when the page records were reordered after approval', async () => {
    const plan = planFrom((a) => a.label === 'To' && a.fieldId.startsWith('workExperience-1'));
    expect(plan.actions).toHaveLength(1);
    // Swap the two work-experience entries: slot 1 now holds the Teaching Assistant job.
    const [we1, we2] = [...document.querySelectorAll('[role="group"]')];
    we1!.parentElement!.insertBefore(we2!, we1!);
    we1!.querySelector('h4')!.textContent = 'Work Experience 2';
    we2!.querySelector('h4')!.textContent = 'Work Experience 1';
    expect(await outcomes(plan)).toEqual(['stale']);
    expect([...document.querySelectorAll<HTMLInputElement>('[data-automation-id="dateSectionYear-input"]')].map((i) => i.value)).toEqual(['2024', '', '2025']);
  });

  it('refuses a forged action that targets a protected field', async () => {
    document.querySelector('main')!.insertAdjacentHTML('afterbegin', '<label for="pw">Password</label><input id="pw" type="password">');
    const plan = { ...planFrom(() => false), actions: [{ actionId: 'x', type: 'set' as const, fieldId: 'pw', kind: 'text' as const, label: 'Password', expectedCurrent: '', proposed: 'hunter2', provenance: 'master' as const, rationale: '' }] };
    const events: string[] = [];
    document.addEventListener('input', () => events.push('input'), true);
    expect(await outcomes(plan)).toEqual(['skipped']);
    expect((document.getElementById('pw') as HTMLInputElement).value).toBe('');
    expect(events).toEqual([]);
  });

  it('refuses an action whose id now names a different question', async () => {
    const plan = planFrom((a) => a.label === 'To', (a) => ({ ...a, label: 'Phone Number' }));
    expect(await outcomes(plan)).toEqual(['stale']);
  });

  it(`adds at most ${MAX_ADDS} entries per plan`, async () => {
    const add = { actionId: 'add', type: 'addRecord' as const, fieldId: 'workExperience', kind: 'unknown' as const, label: 'Add', expectedCurrent: '', proposed: '', provenance: 'master' as const, rationale: '' };
    let added = 0;
    document.querySelector('[data-automation-id="add-button"]')!.addEventListener('click', () => added++);
    const plan = { ...planFrom(() => false), actions: Array.from({ length: 5 }, (_, i) => ({ ...add, actionId: `add${i}` })) };
    expect(await outcomes(plan)).toEqual(['attempted', 'attempted', 'attempted', 'skipped', 'skipped']);
    expect(added).toBe(MAX_ADDS);
  });

  it('restores a combobox when stopped while waiting for choices', async () => {
    const school = document.getElementById('sch') as HTMLInputElement;
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 150);
    const r = await writeField(school, 'combobox', 'Riverside College', ac.signal);
    expect(r).toMatchObject({ ok: false, outcome: 'cancelled' });
    expect(school.value).toBe('Example State Univ');
  });
});

describe('sensitive writes at the page boundary', () => {
  const INITECH = readFileSync('tests/fixtures/workday/wd3/recruiting/initech/Careers/apply/questions.html', 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const ictx = (): BoundPageContext => ({ url: new URL('https://wd3.myworkdaysite.com/recruiting/initech/Careers/apply'), document, binding: { platformId: 'workday', portalOrigin: 'https://wd3.myworkdaysite.com', tenantKey: 'https://wd3.myworkdaysite.com/recruiting/initech/Careers', applicationId: 'a1' } });
  const action = (fieldId: string, label: string, proposed: string, sensitiveCategory?: 'demographic' | 'authorization' | 'legal') =>
    ({ actionId: fieldId, type: 'set' as const, fieldId, kind: 'select' as const, label, expectedCurrent: '', proposed, provenance: 'user' as const, rationale: '', ...(sensitiveCategory ? { sensitiveCategory } : {}) });
  const run = async (a: ApprovedAction) => {
    const r = await workday.apply(ictx(), { planId: crypto.randomUUID(), binding: ictx().binding, stepId: 'application-questions', revision: 0, actions: [a] }, never);
    return r.ok ? r.value.results[0]!.outcome : r.outcome;
  };
  beforeEach(() => { document.documentElement.innerHTML = INITECH; });

  it('writes a sensitive field only with the matching declared category', async () => {
    const label = 'Will you now or in the future require visa sponsorship?';
    expect(await run(action('sp', label, 'No'))).toBe('skipped');
    expect(await run(action('sp', label, 'No', 'demographic'))).toBe('skipped');
    expect((document.getElementById('sp') as HTMLSelectElement).value).toBe('');
    expect(await run(action('sp', label, 'No', 'authorization'))).toBe('attempted');
    expect((document.getElementById('sp') as HTMLSelectElement).value).toBe('No');
  });

  it('a sensitive answer is written only into an option with exactly that text', async () => {
    const sp = document.getElementById('sp') as HTMLSelectElement;
    sp.innerHTML = '<option value="">Select One</option><option>Yes</option><option>No, but I will need it later</option>';
    expect(await run(action('sp', 'Will you now or in the future require visa sponsorship?', 'No', 'authorization'))).toBe('unsupported');
    expect(sp.value).toBe('');
  });

  it('never writes an attestation, whatever the action claims', async () => {
    expect(await run({ ...action('terms', 'I agree to the Terms and Conditions', 'true', 'legal'), kind: 'checkbox' })).toBe('skipped');
    expect((document.getElementById('terms') as HTMLInputElement).checked).toBe(false);
  });
});

describe('isForbiddenClick', () => {
  it.each([
    '<button data-automation-id="bottom-navigation-next-button">Save and Continue</button>',
    '<button data-automation-id="pageFooterNextButton">Next</button>',
    '<button data-automation-id="submit">Submit</button>',
    '<a href="#">Save and Continue</a>',
    '<button aria-label="Submit"><svg></svg></button>',
    '<button>I Agree</button>',
    '<button>Sign In</button>',
    '<button>Delete</button>',
  ])('blocks %s', (html) => {
    document.body.innerHTML = html;
    expect(isForbiddenClick(document.body.firstElementChild!)).toBe(true);
  });
  it.each(['<button>Add Another</button>', '<li role="option">United States of America</li>', '<input type="radio">'])('allows %s', (html) => {
    document.body.innerHTML = html;
    expect(isForbiddenClick(document.body.firstElementChild!)).toBe(false);
  });
});

describe('text writes commit on blur', () => {
  // Live Workday saves text fields on blur. While the side panel holds focus, Chrome moves activeElement but fires no focus/blur events.
  it('sends focusout itself when the window has no focus', async () => {
    document.body.innerHTML = '<input id="address--city">';
    const el = document.querySelector('input')!;
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    el.blur = () => undefined; // native blur is silent in an unfocused window
    const seen: string[] = [];
    el.addEventListener('focusout', () => seen.push('focusout'));
    expect(await writeField(el, 'text', 'Springfield', never)).toEqual({ ok: true });
    hasFocus.mockRestore();
    expect(el.value).toBe('Springfield');
    expect(seen).toEqual(['focusout']);
  });
});

describe('dropdown list lookup', () => {
  // Live Workday: a multiselect's chosen-value pills sit in an always-visible role=listbox; dropdown buttons have no aria-controls.
  const PILLS = '<ul role="listbox" data-automation-id="selectedItemList"><li role="option">United States of America (+1)</li></ul>';
  it('ignores selected-item pills while the real list is still closed', () => {
    document.body.innerHTML = `<button aria-haspopup="listbox" id="address--countryRegion">Select One</button>${PILLS}`;
    expect(listFor(document.querySelector('button')!)).toBeUndefined();
  });
  it('finds the real list next to selected-item pills', () => {
    document.body.innerHTML = `<button aria-haspopup="listbox" id="address--countryRegion">Select One</button>${PILLS}<ul role="listbox" id="states"><li role="option">California</li></ul>`;
    expect(listFor(document.querySelector('button')!)?.id).toBe('states');
  });
});

describe('employer-1-style month/year dates (live QA 2026-10-10)', () => {
  const date = (n: string, label: string) => `<div data-automation-id="formField-${n}"><label>${label}*</label>
    <div data-automation-id="dateInputWrapper" role="group" id="workExperience-5--${n}">
      <div data-automation-id="dateSectionMonth-display">MM</div><input type="text" role="spinbutton" aria-label="Month" data-automation-id="dateSectionMonth-input" id="workExperience-5--${n}-dateSectionMonth-input">
      <div data-automation-id="dateSectionYear-display">YYYY</div><input type="text" role="spinbutton" aria-label="Year" data-automation-id="dateSectionYear-input" id="workExperience-5--${n}-dateSectionYear-input">
    </div></div>`;
  beforeEach(() => {
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2 data-automation-id="jobTitleHeading">Intern</h2>
      <div><h3>My Experience</h3><div role="group" aria-labelledby="Work-Experience-section"><h4 id="Work-Experience-section">Work Experience</h4>
        <div><h5 id="Work-Experience-1-panel">Work Experience 1</h5></div>
        <div role="group" aria-labelledby="Work-Experience-1-panel"><div>
          <div data-automation-id="formField-jobTitle"><label for="t">Job Title*</label><input id="t" type="text"></div>
          ${date('startDate', 'From')}${date('endDate', 'To')}
        </div></div></div></div></div></main>`;
  });

  it('fills and verifies From/To in an empty entry', async () => {
    const plan = planFrom((a) => a.label === 'From' || a.label === 'To');
    expect(plan.actions.map((a) => a.label)).toEqual(['From', 'To']);
    const applied = await workday.apply(ctx(), plan, never);
    expect(applied.ok && applied.value.results.map((r) => `${r.outcome}: ${r.reason}`)).toEqual(['attempted: Written; waiting to verify.', 'attempted: Written; waiting to verify.']);
    const verified = applied.ok ? await workday.verify(ctx(), applied.value, never) : applied;
    expect(verified.ok && verified.value.results.map((r) => r.outcome)).toEqual(['verified', 'verified']);
  });
});

describe('Add Another with h4 section headings (live QA 2026-10-10)', () => {
  it('presses the Add button of the right section', () => {
    document.body.innerHTML = `<div><h3>My Experience</h3>
      <div role="group" aria-labelledby="Work-Experience-section"><h4 id="Work-Experience-section">Work Experience</h4><button id="addWork">Add Another</button></div>
      <div role="group" aria-labelledby="Education-section"><h4 id="Education-section">Education</h4><button id="addEdu">Add Another</button></div></div>`;
    const pressed: string[] = [];
    document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pressed.push(b.id)));
    expect(addRecord(document, 'education')).toEqual({ ok: true });
    expect(addRecord(document, 'workExperience')).toEqual({ ok: true });
    expect(pressed).toEqual(['addEdu', 'addWork']);
  });

  it('finds the work section when the tenant calls it "Work History (Optional)" (live 2026-10-15)', () => {
    document.body.innerHTML = `<div role="group"><h4>Work History (Optional)</h4><button id="addWork">Add Another</button></div>`;
    let pressed = 0;
    document.getElementById('addWork')!.addEventListener('click', () => pressed++);
    expect(addRecord(document, 'workExperience')).toEqual({ ok: true });
    expect(pressed).toBe(1);
  });
});

describe('back-to-back dropdowns (live QA 2026-10-10)', () => {
  // Live Workday: a chosen list lingers ~100ms after the click, and buttons have no aria-controls.
  it('never picks from the previous dropdown\'s closing list', async () => {
    document.body.innerHTML = '<button aria-haspopup="listbox" id="d1">Select One</button><button aria-haspopup="listbox" id="d2">Select One</button>';
    const degrees = ['B.S.', 'M.S.'];
    for (const b of document.querySelectorAll('button')) b.addEventListener('click', () => setTimeout(() => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      for (const d of degrees) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option'); li.textContent = d;
        li.addEventListener('click', () => { b.textContent = d; setTimeout(() => ul.remove(), 100); });
        ul.append(li);
      }
      document.body.append(ul);
    }, 30));
    const [d1, d2] = [...document.querySelectorAll('button')];
    expect(await writeField(d1!, 'dropdown', 'M.S.', never)).toEqual({ ok: true });
    expect(await writeField(d2!, 'dropdown', 'B.S.', never)).toEqual({ ok: true });
    expect([d1!.textContent, d2!.textContent]).toEqual(['M.S.', 'B.S.']);
  });
});

describe('date wrapper commit check (live QA 2026-10-11)', () => {
  // Live Workday's dateInputWrapper saves on blur only if focus left it: relatedTarget || document.activeElement.
  it('moves activeElement out of the field when it sends blur itself', async () => {
    document.body.innerHTML = '<div data-automation-id="dateInputWrapper" id="w"><input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionYear-input"></div>';
    const w = document.getElementById('w')!;
    let commits = 0;
    w.addEventListener('focusout', (e) => { if (!w.contains((e as FocusEvent).relatedTarget as Node ?? document.activeElement)) commits++; });
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(await writeField(w.querySelector('input')!, 'date', '2025-01', never)).toEqual({ ok: true });
    hasFocus.mockRestore();
    expect(commits).toBeGreaterThan(0);
  });
});

describe('date parts commit together (live QA 2026-10-11)', () => {
  // Live Workday mangles a half-entered date if the wrapper saves before the year is in ("05" became year 2005).
  it('saves only once both month and year are entered', async () => {
    document.body.innerHTML = '<div data-automation-id="dateInputWrapper" id="w"><input data-automation-id="dateSectionMonth-input" id="m"><input data-automation-id="dateSectionYear-input" id="y"></div>';
    const w = document.getElementById('w')!;
    const saved: string[] = [];
    w.addEventListener('focusout', (e) => {
      if (w.contains((e as FocusEvent).relatedTarget as Node ?? document.activeElement)) return;
      saved.push(`${(document.getElementById('m') as HTMLInputElement).value}/${(document.getElementById('y') as HTMLInputElement).value}`);
    });
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(await writeField(w.querySelector('input')!, 'date', '2025-05', never)).toEqual({ ok: true });
    hasFocus.mockRestore();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((v) => v === '05/2025')).toBe(true);
  });
});


describe('code-review edge cases (2026-10-11)', () => {
  it('uses a listbox element the site reuses, once it holds new rows', async () => {
    // One shared listbox, repopulated for each dropdown, with the old rows lingering briefly.
    document.body.innerHTML = '<button aria-haspopup="listbox" id="d1">Select One</button><button aria-haspopup="listbox" id="d2">Select One</button><ul role="listbox" id="shared"></ul>';
    const ul = document.getElementById('shared')!;
    const fill = (b: Element, items: string[]) => {
      ul.innerHTML = items.map((t) => `<li role="option">${t}</li>`).join('');
      ul.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => { b.textContent = li.textContent; }));
    };
    document.getElementById('d1')!.addEventListener('click', (e) => setTimeout(() => fill(e.currentTarget as Element ?? document.getElementById('d1')!, ['B.S.', 'M.S.']), 30));
    document.getElementById('d2')!.addEventListener('click', () => setTimeout(() => fill(document.getElementById('d2')!, ['Yes', 'No']), 120));
    const [d1, d2] = [...document.querySelectorAll('button')];
    expect(await writeField(d1!, 'dropdown', 'M.S.', never)).toEqual({ ok: true });
    expect(await writeField(d2!, 'dropdown', 'No', never)).toEqual({ ok: true });
    expect([d1!.textContent, d2!.textContent]).toEqual(['M.S.', 'No']);
  });

  it('never treats a list row as a forbidden navigation click', () => {
    document.body.innerHTML = '<div role="button"><div role="option"><div data-automation-id="promptLeafNode">Next.js</div></div></div><button>Next</button>';
    expect(isForbiddenClick(document.querySelector('[data-automation-id="promptLeafNode"]')!)).toBe(false);
    expect(isForbiddenClick(document.querySelector('button')!)).toBe(true);
    document.body.innerHTML = '<div role="option"><button>Submit</button></div>';
    expect(isForbiddenClick(document.querySelector('button')!)).toBe(true);
  });
});

describe('month/day/year date write (live QA 2026-10-11)', () => {
  it('fills month, day and year, saving once at the end', async () => {
    document.body.innerHTML = '<div data-automation-id="dateInputWrapper" id="w"><input data-automation-id="dateSectionMonth-input" id="m"><input data-automation-id="dateSectionDay-input" id="d"><input data-automation-id="dateSectionYear-input" id="y"></div>';
    const w = document.getElementById('w')!;
    const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    const saved: string[] = [];
    w.addEventListener('focusout', (e) => { if (!w.contains((e as FocusEvent).relatedTarget as Node ?? document.activeElement)) saved.push(`${v('m')}/${v('d')}/${v('y')}`); });
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(await writeField(w.querySelector('input')!, 'date', '2027-05-17', never)).toEqual({ ok: true });
    hasFocus.mockRestore();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((s) => s === '05/17/2027')).toBe(true);
  });
});

describe('sensitive dropdown with several wordings (live QA 2026-10-12)', () => {
  it('opens the list, picks the one choice matching a wording, and verifies it', async () => {
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2>Voluntary Disclosures</h2>
      <div data-automation-id="formField-veteranStatus"><label for="vet">Please select your Veteran's Status from the list below</label><button id="vet" aria-haspopup="listbox">Select One</button></div></div></main>`;
    const button = document.getElementById('vet')!;
    button.addEventListener('click', () => setTimeout(() => {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      for (const o of ['I identify as one or more of the classifications of protected veterans', 'I am not a veteran', 'I do not wish to self-identify']) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option'); li.textContent = o;
        li.addEventListener('click', () => { button.textContent = o; ul.remove(); });
        ul.append(li);
      }
      document.body.append(ul);
    }, 30));
    const snap = scanWorkday(document, 0).snapshot;
    const answers = { memories: [], sensitive: [{ topic: 'veteran' as const, answer: 'I am not a protected veteran\nI am not a veteran' }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'X', jobTitle: 'Y' } };
    const p = propose(snap, sampleStore().profile, {}, answers).proposals[0]!;
    const plan: ApprovedFillPlan = { planId: 'p', binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions: [{
      actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
      sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale }] };
    const applied = await workday.apply(ctx(), plan, never);
    const verified = applied.ok ? await workday.verify(ctx(), applied.value, never) : applied;
    expect(verified.ok && verified.value.results.map((r) => r.outcome)).toEqual(['verified']);
    expect(button.textContent).toBe('I am not a veteran');
  });

  it('says several choices matched when two wordings land on different options', async () => {
    document.body.innerHTML = '<select id="v"><option>I am not a veteran</option><option>I am not a protected veteran</option></select>';
    expect(await writeField(document.getElementById('v')!, 'select', 'I am not a veteran\nI am not a protected veteran', never, true))
      .toEqual({ ok: false, outcome: 'unsupported', reason: 'Several choices could match; pick one yourself.' });
  });
});

describe('CC-305 disability form (live QA 2026-10-12)', () => {
  it('fills the box matching the saved disability answer, though the question names no topic', async () => {
    const BOXES = ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'];
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2>Self Identify</h2><h3>Voluntary Self-Identification of Disability</h3>
      <div data-automation-id="formField-disabilityStatus"><fieldset><legend>Please check one of the boxes below:*</legend>
        ${BOXES.map((b, i) => `<div><input type="checkbox" id="d${i}"><label for="d${i}">${b}</label></div>`).join('')}
      </fieldset></div></div></main>`;
    const snap = scanWorkday(document, 0).snapshot;
    const answers = { memories: [], sensitive: [{ topic: 'disability' as const, answer: BOXES[1]! }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'X', jobTitle: 'Y' } };
    const p = propose(snap, sampleStore().profile, {}, answers).proposals[0]!;
    expect(p).toMatchObject({ proposed: BOXES[1], safe: false, sensitiveCategory: 'demographic' });
    const plan: ApprovedFillPlan = { planId: 'p', binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions: [{
      actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
      sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale }] };
    const applied = await workday.apply(ctx(), plan, never);
    const verified = applied.ok ? await workday.verify(ctx(), applied.value, never) : applied;
    expect(verified.ok && verified.value.results.map((r) => r.outcome)).toEqual(['verified']);
    expect([...document.querySelectorAll<HTMLInputElement>('input')].map((i) => i.checked)).toEqual([false, true, false]);
  });
});

describe('sensitive checkbox group (live QA 2026-10-12)', () => {
  it('ticks only the box matching the dashboard answer, after its own approval', async () => {
    const RACE = ['Asian', 'Black or African American', 'White'].map((r) => `${r} (United States of America)`);
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2>Voluntary Disclosures</h2>
      <div data-automation-id="formField-ethnicityMulti"><label>Please indicate your race.*</label><div>
        ${RACE.map((r, i) => `<div><input type="checkbox" id="r${i}"><label for="r${i}">${r}</label></div>`).join('')}
      </div></div></div></main>`;
    const snap = scanWorkday(document, 0).snapshot;
    const answers = { memories: [], sensitive: [{ topic: 'race' as const, answer: 'Asian' }], ctx: { tenantKey: 't', applicationId: 'a1', employer: 'X', jobTitle: 'Y' } };
    const p = propose(snap, sampleStore().profile, {}, answers).proposals[0]!;
    expect(p).toMatchObject({ proposed: 'Asian (United States of America)', safe: false, sensitiveCategory: 'demographic' });
    const plan: ApprovedFillPlan = { planId: 'p', binding: ctx().binding, stepId: snap.stepId, revision: snap.revision, actions: [{
      actionId: p.actionId, type: p.type, fieldId: p.fieldId, kind: p.kind, label: p.label, expectedCurrent: p.current, proposed: p.proposed,
      sensitiveCategory: p.sensitiveCategory, provenance: p.provenance, rationale: p.rationale }] };
    const applied = await workday.apply(ctx(), plan, never);
    const verified = applied.ok ? await workday.verify(ctx(), applied.value, never) : applied;
    expect(verified.ok && verified.value.results.map((r) => r.outcome)).toEqual(['verified']);
    expect([...document.querySelectorAll<HTMLInputElement>('input')].map((i) => i.checked)).toEqual([true, false, false]);
  });
});
