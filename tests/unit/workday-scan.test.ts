import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { scanWorkday } from '../../src/adapters/workday/scan';

const W = 'tests/fixtures/workday';
function load(path: string) {
  document.documentElement.innerHTML = readFileSync(`${W}/${path}`, 'utf8').replace(/<script[^>]*><\/script>/g, '');
  return scanWorkday(document, 1).snapshot;
}
const byLabel = (fields: ReturnType<typeof load>['fields'], label: string) => fields.filter((f) => f.label === label);

describe('scanWorkday: acme (standard automation ids)', () => {
  const s = load('acme/en-US/External/apply/my-information.html');

  it('recognizes the step by its label, not its position', () => {
    expect(s.stepLabel).toBe('My Information');
    expect(s.stepId).toBe('my-information');
  });

  it('reads fields with semantics, values and required flags', () => {
    expect(byLabel(s.fields, 'First Name')[0]).toMatchObject({ kind: 'text', semantic: 'contact.firstName', value: 'Avery', required: true, section: 'Legal Name' });
    expect(byLabel(s.fields, 'Last Name')[0]).toMatchObject({ value: '', required: true });
    expect(byLabel(s.fields, 'Country')[0]).toMatchObject({ kind: 'dropdown', semantic: 'contact.country', value: 'United States of America' });
    expect(byLabel(s.fields, 'How Did You Hear About Us?')[0]).toMatchObject({ kind: 'dropdown', value: '' });
    expect(byLabel(s.fields, 'LinkedIn')[0]).toMatchObject({ semantic: 'links.linkedin' });
    expect(byLabel(s.fields, 'Have you previously worked for Acme Robotics?')[0]).toMatchObject({ kind: 'radio', value: 'No', options: ['Yes', 'No'] });
  });

  it('reports visible validation errors', () => expect(s.errors).toEqual(['Last Name is required']));

  it('does not list navigation buttons as fields', () => expect(s.fields.some((f) => /continue|next/i.test(f.label))).toBe(false));
});

describe('scanWorkday: globex (aria labels, repeated records)', () => {
  const s = load('globex/Careers/apply/my-experience.html');

  it('uses aria-current for the step', () => expect(s.stepLabel).toBe('My Experience'));

  it('groups repeated work experience by record, not by DOM order alone', () => {
    const titles = s.fields.filter((f) => f.semantic === 'employment.title');
    expect(titles.map((f) => [f.recordKey, f.value])).toEqual([['workExperience-1', 'Software Engineering Intern'], ['workExperience-2', 'Teaching Assistant']]);
    expect(s.fields.find((f) => f.recordKey === 'workExperience-1' && f.semantic === 'employment.employer')?.value).toBe('Acme Robotics Inc');
  });

  it('reads month/year date widgets as one partial date', () => {
    const dates = s.fields.filter((f) => f.kind === 'date');
    expect(dates.map((f) => [f.semantic, f.value])).toEqual([['employment.start', '2024-06'], ['employment.end', ''], ['education.end', '2025']]);
  });

  it('reads education, multiselect skills and file upload', () => {
    expect(s.fields.find((f) => f.semantic === 'education.school')).toMatchObject({ kind: 'combobox', value: 'Example State Univ', recordKey: 'education-1' });
    expect(s.fields.find((f) => f.semantic === 'education.degree')).toMatchObject({ kind: 'dropdown', value: '' });
    expect(s.fields.find((f) => f.semantic === 'skills')).toMatchObject({ kind: 'multiselect', value: 'TypeScript' });
    expect(s.fields.find((f) => f.kind === 'file')).toMatchObject({ semantic: 'resume.file' });
    expect(s.fields.filter((f) => f.kind === 'multiselect')).toHaveLength(1);
  });

  it('marks label ties as uncertain and drops their semantics', () => {
    const ties = byLabel(s.fields, 'Details');
    expect(ties).toHaveLength(2);
    expect(ties.every((f) => f.uncertain && !f.semantic)).toBe(true);
  });

  it('skips hidden fields', () => expect(s.fields.some((f) => f.label === 'Hidden Field')).toBe(false));
});

describe('scanWorkday: initech (protected questions)', () => {
  const s = load('wd3/recruiting/initech/Careers/apply/questions.html');
  const f = (label: string) => byLabel(s.fields, label)[0]!;

  it('strips step numbering from the label', () => expect(s.stepLabel).toBe('Application Questions'));

  it('tags sensitive questions and never gives them a fill semantic', () => {
    expect(f('Are you legally authorized to work in the United States?')).toMatchObject({ protection: 'authorization', kind: 'radio' });
    expect(f('Will you now or in the future require visa sponsorship?')).toMatchObject({ protection: 'authorization', options: ['Yes', 'No'] });
    expect(f('Have you ever been convicted of a felony?')).toMatchObject({ protection: 'legal' });
    expect(f('Please select')).toMatchObject({ protection: 'demographic', section: 'Voluntary Disclosures' });
    expect(s.fields.filter((x) => x.protection).every((x) => !x.semantic)).toBe(true);
  });

  it('never reads the value of an attestation', () => {
    const terms = f('I agree to the Terms and Conditions');
    expect(terms.protection).toBe('attestation');
    expect('value' in terms).toBe(false);
  });

  it('leaves ordinary questions unprotected', () => {
    expect(f('Desired salary').protection).toBeUndefined();
    expect(f('Are you willing to relocate?')).toMatchObject({ required: true, kind: 'select' });
    expect(f('Are you willing to relocate?').protection).toBeUndefined();
  });
});

describe('scanWorkday: grouping and kind checks', () => {
  it('keeps unnamed radios and unwrapped date pairs separate, and ignores semantics that do not fit the control', () => {
    document.body.innerHTML = `<div data-automation-id="applyFlowPage">
      <label><input type="radio"> Option A</label><label><input type="radio"> Option B</label>
      <fieldset><legend>Do you have a LinkedIn profile?</legend><label><input type="radio" name="li"> Yes</label><label><input type="radio" name="li"> No</label></fieldset>
      <div data-automation-id="formField-dates"><label>Dates</label>
        <span><input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionYear-input" value="2020"></span>
        <span><input data-automation-id="dateSectionMonth-input"><input data-automation-id="dateSectionYear-input" value="2021"></span></div>
    </div>`;
    const s = scanWorkday(document, 1).snapshot;
    expect(s.fields.filter((f) => f.kind === 'radio' && f.label.startsWith('Option'))).toHaveLength(2);
    const li = s.fields.find((f) => f.label === 'Do you have a LinkedIn profile?')!;
    expect([li.kind, li.semantic]).toEqual(['radio', undefined]);
    expect(s.fields.filter((f) => f.kind === 'date').map((f) => f.value)).toEqual(['2020', '2021']);
  });
});

describe('scanWorkday: employer-1-style markup (live QA 2026-10-10)', () => {
  // Mirrors a live tenant: record groups point at an h5 via aria-labelledby; the job title is an h2 inside applyFlowPage.
  const page = (activeStep: string) => `<main><div data-automation-id="applyFlowPage">
    <h2 data-automation-id="jobTitleHeading">Software Engineering Intern</h2>
    <ol data-automation-id="progressBar"><li data-automation-id="progressBarActiveStep">${activeStep}</li></ol>
    <div><h3>My Experience</h3><div data-automation-id="applyFlowMyExpPage">
      <div role="group" aria-labelledby="Work-Experience-section"><h4 id="Work-Experience-section">Work Experience</h4>
        <div><h5 id="Work-Experience-1-panel">Work Experience 1</h5></div>
        <div role="group" aria-labelledby="Work-Experience-1-panel"><div>
          <div data-automation-id="formField-jobTitle"><label for="workExperience-7--jobTitle">Job Title*</label><input id="workExperience-7--jobTitle" type="text"></div>
          <div data-automation-id="formField-companyName"><label for="workExperience-7--companyName">Company*</label><input id="workExperience-7--companyName" type="text"></div>
        </div></div>
      </div>
      <div role="group" aria-labelledby="Education-section"><h4 id="Education-section">Education</h4>
        <div><h5 id="Education-1-panel">Education 1</h5></div>
        <div role="group" aria-labelledby="Education-1-panel"><div>
          <div data-automation-id="formField-schoolName"><label for="education-8--schoolName">School or University*</label><input id="education-8--schoolName" type="text"></div>
          <div data-automation-id="formField-gradeAverage"><label for="education-8--gradeAverage">Overall Result (GPA)</label><input id="education-8--gradeAverage" type="text"></div>
          <div data-automation-id="formField-fieldOfStudy"><label for="education-8--fieldOfStudy">Field of Study</label><div data-automation-id="multiselectInputContainer"><div><input id="education-8--fieldOfStudy" type="text"></div></div></div>
        </div></div>
      </div>
    </div></div>
  </div></main>`;
  const scan = (activeStep: string) => { document.documentElement.innerHTML = page(activeStep); return scanWorkday(document, 1).snapshot; };

  it('finds records through aria-labelledby headings', () => {
    const s = scan('<label>current step 2 of 6</label><label>My Experience</label>');
    expect(byLabel(s.fields, 'Job Title')[0]).toMatchObject({ recordKey: 'workExperience-1', semantic: 'employment.title' });
    expect(byLabel(s.fields, 'Company')[0]).toMatchObject({ recordKey: 'workExperience-1', semantic: 'employment.employer' });
    expect(byLabel(s.fields, 'School or University')[0]).toMatchObject({ recordKey: 'education-1', semantic: 'education.school' });
    expect(byLabel(s.fields, 'Overall Result (GPA)')[0]).toMatchObject({ recordKey: 'education-1', semantic: 'education.gpa' });
    expect(byLabel(s.fields, 'Field of Study')[0]).toMatchObject({ recordKey: 'education-1', kind: 'multiselect', semantic: 'education.major' });
  });

  it('finds records whose headings say "Work History (Optional) 1" or "Education (Required) 1" (live 2026-10-15)', () => {
    document.documentElement.innerHTML = page('<label>My Experience</label>')
      .replace('>Work Experience 1<', '>Work History (Optional) 1<').replace('>Education 1<', '>Education (Required) 1<');
    const s = scanWorkday(document, 1).snapshot;
    expect(byLabel(s.fields, 'Job Title')[0]).toMatchObject({ recordKey: 'workExperience-1', semantic: 'employment.title' });
    expect(byLabel(s.fields, 'School or University')[0]).toMatchObject({ recordKey: 'education-1', semantic: 'education.school' });
    expect(s.fields.filter((f) => f.uncertain)).toEqual([]);
  });

  it('names the step from the page heading while the progress bar label is still rendering', () => {
    expect(scan('<label>current step 2 of 6</label>').stepLabel).toBe('My Experience');
  });
});

describe('stepLabel without a progress bar (code review 2026-10-11)', () => {
  it('never names the step after a section h3', () => {
    document.documentElement.innerHTML = '<head><title>Apply</title></head><body><main><div data-automation-id="applyFlowPage"><h3>Legal Name</h3><input></div></main></body>';
    expect(scanWorkday(document, 1).snapshot.stepLabel).toBe('Apply');
  });
});

describe('month/day/year dates (live QA 2026-10-11, employer 2)', () => {
  it('reads all three parts as one date field, label without its colon', () => {
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2>Application Questions</h2>
      <div data-automation-id="formField-dateAvailable"><label>Date Available:*</label><div data-automation-id="dateInputWrapper" role="group">
        <div data-automation-id="dateSectionMonth-display">05</div><input data-automation-id="dateSectionMonth-input" value="5">
        <div data-automation-id="dateSectionDay-display">17</div><input data-automation-id="dateSectionDay-input" value="17">
        <div data-automation-id="dateSectionYear-display">2027</div><input data-automation-id="dateSectionYear-input" value="2027">
      </div></div></div></main>`;
    const fields = scanWorkday(document, 1).snapshot.fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ kind: 'date', label: 'Date Available', value: '2027-05-17' });
  });
});

describe('Google sign-in detection (live QA 2026-10-11)', () => {
  const page = (button: string) => {
    document.documentElement.innerHTML = `<body><div data-automation-id="applyFlowPage"><div data-automation-id="signInContent"><h2>Sign In</h2>${button}<button>Sign in with email</button></div></div></body>`;
    return scanWorkday(document, 1).snapshot.page;
  };
  it.each([
    ['iframe', '<iframe src="https://accounts.google.com/gsi/button" srcdoc=""></iframe>'],
    ['aria-label', '<button aria-label="Sign in with Google"><svg></svg></button>'],
    ['automation id', '<button data-automation-id="googleSignInButtonV2"><svg></svg></button>'],
    ['text', '<button>Sign in with Google</button>'],
  ])('notices a Google button built as %s', (_, button) => expect(page(button)).toMatchObject({ kind: 'signIn', sso: ['Google'] }));
  it('reports none without one', () => expect(page('')?.sso).toEqual([]));
});

describe('submission lands on Candidate Home (live QA 2026-10-11, employer 3)', () => {
  it('recognizes Candidate Home on the same portal and its "Application Submitted" dialog as a confirmation', async () => {
    const { detectWorkday } = await import('../../src/adapters/workday/detection');
    document.documentElement.innerHTML = `<body><div data-automation-id="CandidateHomePage"><div data-automation-id="candidate-home-app">
      <h2 data-automation-id="welcomeMsgHeader">Welcome, Avery Example</h2><h3>My Tasks</h3>
      <div role="dialog"><h2>Application Submitted</h2><p>Thank you for your application! Your application will be reviewed by the hiring team.</p></div>
      <h3>My Applications</h3></div></div></body>`;
    const home = new URL('https://acme.wd1.myworkdayjobs.com/en-US/External/userHome');
    const apply = new URL('https://acme.wd1.myworkdayjobs.com/en-US/External/job/Springfield/Intern_R1/apply');
    expect(detectWorkday(home, document)).toMatchObject({ status: 'supported', tenantKey: detectWorkday(apply, document).tenantKey });
    expect(scanWorkday(document, 1).snapshot.page?.kind).toBe('confirmation');
  });

  it("never lists the site's header menus as questions (live QA: Settings on Candidate Home)", () => {
    document.documentElement.innerHTML = `<body><div data-automation-id="header"><div data-automation-id="utilityButtonBar">
      <button aria-haspopup="listbox" data-automation-id="settingsSelectorButton">Settings</button></div></div>
      <div data-automation-id="CandidateHomePage"><h3>My Applications</h3></div></body>`;
    expect(scanWorkday(document, 1).snapshot.fields).toEqual([]);
  });
});

describe('Voluntary Disclosures (live QA 2026-10-12, employer 4)', () => {
  const RACE = ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'White'].map((r) => `${r} (United States of America)`);
  beforeEach(() => {
    document.documentElement.innerHTML = `<main><div data-automation-id="applyFlowPage"><h2>Voluntary Disclosures</h2>
      <div role="group" aria-labelledby="pds"><h4 id="pds">Personal Data Statement</h4>
        <div data-automation-id="formField-veteranStatus"><label for="vet">Indicate your military/veterans status based on the definitions provided.</label><button id="vet" aria-haspopup="listbox">Select One</button></div>
        <!-- Live Workday employer 4 nesting: the question's legend is on an outer fieldset; the boxes sit in an inner fieldset's grid. -->
        <div data-automation-id="formField-ethnicityMulti"><fieldset><legend><label id="label536">Please indicate your race.*</label></legend>
          <div><div><span><fieldset data-automation-id="ethnicityMulti-CheckboxGroup"><div><div role="grid">
            ${RACE.map((r, i) => `<div role="row"><div role="row"><div role="cell"><div><input type="checkbox" id="r${i}"><label for="r${i}">${r}</label></div></div></div></div>`).join('')}
          </div></div></fieldset></span></div></div>
        </fieldset></div>
      </div></div></main>`;
  });

  it('treats "military/veterans status" as sensitive', () => {
    expect(byLabel(scanWorkday(document, 1).snapshot.fields, 'Indicate your military/veterans status based on the definitions provided.')[0]).toMatchObject({ protection: 'demographic' });
  });

  it('reads a group of checkboxes as one sensitive choice question', () => {
    const race = scanWorkday(document, 1).snapshot.fields.filter((f) => f.kind === 'radio' || f.kind === 'checkbox');
    expect(race).toHaveLength(1);
    expect(race[0]).toMatchObject({ kind: 'radio', label: 'Please indicate your race.', protection: 'demographic', options: RACE, value: '' });
  });
});
