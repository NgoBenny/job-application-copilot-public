import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanWorkday } from '../../src/adapters/workday/scan';
import { holdsAnswer, propose, sameValue } from '../../src/domain/plan';
import type { ScannedField, ScanSnapshot } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';

const profile = sampleStore().profile;
profile.contact.lastName = 'Example';
profile.links.push({ id: 'link-2', kind: 'linkedin', label: '', url: 'https://linkedin.com/in/avery-example' });

function snap(path: string): ScanSnapshot {
  document.documentElement.innerHTML = readFileSync(`tests/fixtures/workday/${path}`, 'utf8').replace(/<script[^>]*><\/script>/g, '');
  return scanWorkday(document, 1).snapshot;
}
const field = (over: Partial<ScannedField>): ScannedField => ({ fieldId: 'f', kind: 'text', label: 'L', section: '', required: false, disabled: false, value: '', ...over });
const s = (fields: ScannedField[]): ScanSnapshot => ({ stepId: 'x', stepLabel: 'X', revision: 1, fields, errors: [] });

describe('greenhouse-style values (2026-10-12)', () => {
  const edu = (over: Partial<ScannedField>) => field({ recordKey: 'education-1', section: 'Education', ...over });
  const page = s([
    field({ fieldId: 'loc', kind: 'dropdown', label: 'Location (City)', semantic: 'contact.location' }),
    edu({ fieldId: 'school--0', kind: 'dropdown', label: 'School', semantic: 'education.school' }),
    edu({ fieldId: 'end-month--0', kind: 'dropdown', label: 'End date month', semantic: 'education.endMonth' }),
    edu({ fieldId: 'end-year--0', label: 'End date year', semantic: 'education.endYear' }),
  ]);
  const by = (id: string) => propose(page, profile).proposals.find((p) => p.fieldId === id);

  it('splits a date into month name and year', () => {
    expect(by('end-month--0')?.proposed).toBe('May');
    expect(by('end-year--0')?.proposed).toBe('2025');
  });
  it('gives "Location (City)" the city (and region when known)', () => expect(by('loc')?.proposed).toBe('Springfield'));
  it('never invents a month for a year-only date', () => {
    const p = { ...profile, education: [{ ...profile.education[0]!, end: '2025' }] };
    expect(propose(page, p).proposals.find((x) => x.fieldId === 'end-month--0')).toBeUndefined();
  });
});

describe('propose: contact step', () => {
  const r = propose(snap('acme/en-US/External/apply/my-information.html'), profile);
  const by = (label: string) => r.proposals.find((p) => p.label === label);

  it('fills empty fields from the master profile and marks them safe', () => {
    expect(by('Last Name')).toMatchObject({ current: '', proposed: 'Example', safe: true, provenance: 'master' });
    expect(by('Phone Number')).toMatchObject({ proposed: '555-0100', safe: true });
    expect(by('LinkedIn')).toMatchObject({ proposed: 'https://linkedin.com/in/avery-example', safe: true });
  });

  it('skips fields that are already correct', () => {
    expect(by('First Name')).toBeUndefined();
    expect(by('Email Address')).toBeUndefined();
  });

  it('treats a choice that already shows the matching option as correct', () => expect(by('Country')).toBeUndefined());

  it('treats a different existing value as a correction that needs approval', () => {
    const c = propose(s([field({ semantic: 'contact.city', value: 'Shelbyville' })]), profile).proposals[0]!;
    expect(c).toMatchObject({ current: 'Shelbyville', proposed: 'Springfield', safe: false });
    expect(c.rationale).toMatch(/approve only if it's wrong/);
  });

  it('never proposes for unmatched or protected questions', () => {
    expect(by('How Did You Hear About Us?')).toBeUndefined();
    expect(propose(snap('wd3/recruiting/initech/Careers/apply/questions.html'), profile).proposals).toEqual([]);
  });

  it('is idempotent: once values match, nothing is proposed', () => {
    const filled = s([field({ semantic: 'contact.lastName', value: 'Example' }), field({ fieldId: 'g', semantic: 'contact.phone', value: '555-0100' })]);
    expect(propose(filled, profile).proposals).toEqual([]);
  });

  it('never proposes clearing a field', () => {
    const p = { ...profile, contact: { ...profile.contact, city: '' } };
    expect(propose(s([field({ semantic: 'contact.city', value: 'Old Town' })]), p).proposals).toEqual([]);
  });
});

describe('propose: My Experience repair', () => {
  const r = propose(snap('globex/Careers/apply/my-experience.html'), profile);

  it('links page records to master records by identity', () => {
    expect(r.records).toEqual([
      { recordKey: 'workExperience-1', kind: 'employment', label: 'Software Engineering Intern at Acme Robotics Inc', masterId: 'emp-1', reason: 'Matched by name' },
      { recordKey: 'workExperience-2', kind: 'employment', label: 'Teaching Assistant at Example State', reason: 'Not found in your master profile.' },
      { recordKey: 'education-1', kind: 'education', label: 'Example State Univ', masterId: 'edu-1', reason: 'Matched by name' },
    ]);
  });

  it('proposes only what differs, within the matched record', () => {
    expect(r.proposals.filter((p) => p.type === 'set').map((p) => [p.recordKey, p.label, p.current, p.proposed, p.safe])).toEqual([
      ['workExperience-1', 'To', '', '2024-08', true],
      ['education-1', 'Degree', '', 'BS', true],
    ]);
  });

  it('matches by identity even when the profile lists records in a different order', () => {
    const p = { ...profile, employment: [{ ...profile.employment[0]!, id: 'emp-0', employer: 'Initech', title: 'Analyst' }, profile.employment[0]!] };
    const out = propose(snap('globex/Careers/apply/my-experience.html'), p);
    expect(out.records[0]).toMatchObject({ recordKey: 'workExperience-1', masterId: 'emp-1' });
    expect(out.proposals.find((x) => x.recordKey === 'workExperience-1')).toMatchObject({ recordId: 'emp-1' });
  });

  it('never touches an unmatched record', () => expect(r.proposals.some((p) => p.recordKey === 'workExperience-2')).toBe(false));

  it('uses only the year for a year-only date control', () => {
    const p = { ...profile, education: [{ ...profile.education[0]!, end: '2026-05' }] };
    const out = propose(snap('globex/Careers/apply/my-experience.html'), p);
    expect(out.proposals.find((x) => x.label === 'To (Actual or Expected)')).toMatchObject({ current: '2025', proposed: '2026', safe: false });
  });

  it('offers a bounded, unsafe Add for master records missing from the page', () => {
    const p = { ...profile, employment: [...profile.employment, { id: 'emp-2', employer: 'Globex Corporation', title: 'Data Analyst', location: '', start: '2025-01', end: '', current: true, bullets: [] }] };
    const add = propose(snap('globex/Careers/apply/my-experience.html'), p).proposals.filter((x) => x.type === 'addRecord');
    expect(add).toEqual([expect.objectContaining({ actionId: 'add:employment:emp-2', safe: false, fieldId: 'workExperience' })]);
  });

  it('respects a manual link and leaves ambiguous matches unlinked', () => {
    const manual = propose(snap('globex/Careers/apply/my-experience.html'), profile, { 'workExperience-2': 'emp-1', 'workExperience-1': 'emp-1' });
    expect(manual.records.find((x) => x.recordKey === 'workExperience-2')).toMatchObject({ masterId: 'emp-1', reason: 'Linked by you' });
    const twoAcme = { ...profile, employment: [profile.employment[0]!, { ...profile.employment[0]!, id: 'emp-3', title: 'Robotics Engineer', start: '2025-01' }] };
    const amb = s([field({ fieldId: 'a', recordKey: 'workExperience-1', semantic: 'employment.employer', value: 'Acme Robotics' }), field({ fieldId: 'b', recordKey: 'workExperience-1', semantic: 'employment.title', value: 'Manager' })]);
    const rec = propose(amb, twoAcme).records[0]!;
    expect(rec.masterId).toBeUndefined();
    expect(rec.reason).toContain('Link it yourself');
  });

  it('pairs a newly added empty record for review, never as safe', () => {
    const p = { ...profile, employment: [...profile.employment, { id: 'emp-2', employer: 'Globex Corporation', title: 'Data Analyst', location: '', start: '2025-01', end: '', current: true, bullets: [] }] };
    const page = s([field({ fieldId: 'e', recordKey: 'workExperience-3', semantic: 'employment.employer' }), field({ fieldId: 't', recordKey: 'workExperience-3', semantic: 'employment.title' })]);
    const out = propose(page, p);
    expect(out.proposals.filter((x) => x.type === 'set').map((x) => [x.proposed, x.safe])).toEqual([['Acme Robotics', false], ['Software Engineering Intern', false]]);
  });
});

describe('sameValue', () => {
  it('treats the same degree in different wordings as already filled (live QA 2026-10-12)', () => {
    expect(sameValue('Master of Science (M.S)', 'Masters of Science', 'education.degree')).toBe(true);
    expect(sameValue('Bachelor of Science (B.S)', 'Masters of Science', 'education.degree')).toBe(false);
    expect(sameValue('Master of Science (M.S)', 'Masters of Science')).toBe(false);
  });
  it('treats differently formatted phone numbers as the same (live QA: parser wrote "+1 (408) …")', () => {
    expect(sameValue('+1 (408) 555-0100', '4085550100', 'contact.phone')).toBe(true);
    expect(sameValue('408-555-0100', '(408) 555 0100', 'contact.phone')).toBe(true);
    expect(sameValue('+1 (408) 555-0199', '4085550100', 'contact.phone')).toBe(false);
    expect(sameValue('555-0100', '4085550100', 'contact.phone')).toBe(false);
    // A trunk 0 left by another country's format is a different number (live Greenhouse 2026-10-12).
    expect(sameValue('040 85550100', '4085550100', 'contact.phone')).toBe(false);
    expect(sameValue('+1 (408) 555-0100', '4085550100')).toBe(false);
  });
  it('compares names loosely and other values strictly', () => {
    expect(sameValue('Acme Robotics Inc', 'Acme Robotics', 'employment.employer')).toBe(true);
    expect(sameValue('555-0100', '5550100', 'contact.phone')).toBe(true); // same digits (phones compare by digits since 2026-10-11)
    expect(sameValue('555-0100', '5550100', 'contact.postalCode')).toBe(false);
    expect(sameValue(' Example ', 'example')).toBe(true);
  });
});

describe('propose: saved and sensitive answers', () => {
  const ctx = { tenantKey: 'https://wd3.myworkdaysite.com/recruiting/initech/Careers', applicationId: 'app-i', employer: 'Initech', jobTitle: 'SWE' };
  const memories = [
    { id: 'm1', question: 'Are you willing to relocate?', kind: 'choice' as const, answer: 'Yes', options: ['Yes', 'No'], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'm2', question: 'Desired salary', kind: 'text' as const, answer: '100k', options: [], scope: 'employer' as const, tenantKey: 'https://acme.wd1.myworkdayjobs.com/External', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
  ];
  const sensitive = [{ topic: 'authorizedToWork' as const, answer: 'Yes' }, { topic: 'sponsorship' as const, answer: 'No' }, { topic: 'conviction' as const, answer: 'No' }, { topic: 'gender' as const, answer: 'Female' }];
  const r = propose(snap('wd3/recruiting/initech/Careers/apply/questions.html'), profile, {}, { memories, sensitive, ctx });
  const by = (label: string) => r.proposals.find((p) => p.label === label);

  it('reuses a global confirmed choice as safe', () => expect(by('Are you willing to relocate?')).toMatchObject({ proposed: 'Yes', provenance: 'approved answer memory', safe: true }));
  it('does not reuse another employer\'s answer', () => expect(by('Desired salary')).toBeUndefined());

  it('proposes saved sensitive answers only for clearly named topics, never as safe', () => {
    expect(by('Are you legally authorized to work in the United States?')).toMatchObject({ proposed: 'Yes', provenance: 'user', safe: false, sensitiveCategory: 'authorization' });
    expect(by('Will you now or in the future require visa sponsorship?')).toMatchObject({ proposed: 'No', safe: false, sensitiveCategory: 'authorization' });
    expect(by('Have you ever been convicted of a felony?')).toMatchObject({ proposed: 'No', sensitiveCategory: 'legal' });
    expect(by('Please select')).toBeUndefined(); // gender question with a bland label: unclear, left to you
    expect(by('I agree to the Terms and Conditions')).toBeUndefined();
  });
});

describe('sensitive answers with several wordings (live QA 2026-10-12)', () => {
  const ctx = { tenantKey: 't', applicationId: 'a', employer: 'Initech', jobTitle: 'SWE' };
  const veteran = 'I am not a protected veteran\nI am not a veteran';
  const propVet = (value: string) => propose(s([field({ fieldId: 'v', kind: 'dropdown', label: "Please select your Veteran's Status", protection: 'demographic', value })]), profile, {}, { memories: [], sensitive: [{ topic: 'veteran', answer: veteran }], ctx }).proposals;

  it('proposes all wordings for a closed dropdown; the write step needs one exact choice', () => expect(propVet('')[0]).toMatchObject({ proposed: veteran, sensitiveCategory: 'demographic', safe: false }));
  it('proposes nothing when the page already holds one of the wordings', () => expect(propVet('I am not a veteran')).toEqual([]));
  it('counts only an exact wording as held: a bracketed note can change the answer', () => {
    expect(holdsAnswer('Asian (Not Hispanic or Latino)', 'Asian\nAsian (Not Hispanic or Latino)')).toBe(true);
    expect(holdsAnswer('No (but I will need sponsorship later)', 'No')).toBe(false);
    expect(holdsAnswer('Asian Indian', 'Asian')).toBe(false);
  });
});

describe('saved answers for search boxes (live QA 2026-10-12, Workday employer 8)', () => {
  const ctx = { tenantKey: 't', applicationId: 'a', employer: 'Workday employer 8', jobTitle: 'Intern' };
  const memories = [{ id: 'm', question: 'How Did You Hear About Us?', kind: 'choice' as const, answer: 'Job Board: LinkedIn', options: [], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-12T00:00:00.000Z' }];
  const run = (f: Partial<ScannedField>, sensitive: { topic: 'veteran'; answer: string }[] = []) => propose(s([field({ fieldId: 'h', kind: 'multiselect', label: 'How Did You Hear About Us?', value: '', ...f })]), profile, {}, { memories, sensitive, ctx }).proposals;

  it('proposes a remembered choice, never as safe', () => expect(run({})[0]).toMatchObject({ kind: 'multiselect', proposed: 'Job Board: LinkedIn', safe: false }));
  it('proposes nothing when the box already holds it', () => expect(run({ value: 'Job Board: LinkedIn' })).toEqual([]));
  it('never proposes a sensitive answer for a search box', () => expect(run({ label: 'Veteran status', protection: 'demographic' }, [{ topic: 'veteran', answer: 'I am not a veteran' }])).toEqual([]));
});

describe('propose: answers in dropdowns and text', () => {
  const ctx = { tenantKey: 't', applicationId: 'a', employer: 'Initech', jobTitle: 'SWE' };
  const memories = [
    { id: 'm1', question: 'How did you hear about us?', kind: 'choice' as const, answer: 'Job board', options: [], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'm2', question: 'Why this company?', kind: 'text' as const, answer: 'I admire {{employer}}.', options: [], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'm3', question: 'Are you willing to travel?', kind: 'choice' as const, answer: 'Yes', options: ['Yes', 'No'], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-01T00:00:00.000Z' },
  ];
  const page = s([
    field({ fieldId: 'src', kind: 'dropdown', label: 'How did you hear about us?' }),
    field({ fieldId: 'why', kind: 'text', label: 'Why this company?' }),
    field({ fieldId: 'sp', kind: 'dropdown', label: 'Will you require sponsorship?', protection: 'authorization' }),
    field({ fieldId: 'tr', kind: 'select', label: 'Are you willing to travel?', options: ['Yes', 'No', 'Sometimes'] }),
  ]);
  const r = propose(page, profile, {}, { memories, sensitive: [{ topic: 'sponsorship', answer: 'No' }], ctx });

  it('proposes saved answers for closed dropdowns, never as safe', () => {
    expect(r.proposals.find((p) => p.fieldId === 'src')).toMatchObject({ proposed: 'Job board', safe: false });
    expect(r.proposals.find((p) => p.fieldId === 'sp')).toMatchObject({ proposed: 'No', safe: false, sensitiveCategory: 'authorization' });
  });
  it('never marks text answers safe, even exact ones', () => expect(r.proposals.find((p) => p.fieldId === 'why')).toMatchObject({ proposed: 'I admire Initech.', safe: false }));
  it('explains a saved answer that was not used', () => expect(r.notes).toEqual([{ label: 'Are you willing to travel?', reason: 'The choices differ from when you saved this answer.' }]));
});

describe('propose: search-and-pick boxes (live QA 2026-10-11)', () => {
  it('proposes the major for a Field of Study box, never as safe', () => {
    const fos = field({ fieldId: 'education-1/fieldOfStudy', kind: 'multiselect', label: 'Field of Study', semantic: 'education.major', recordKey: 'education-1' });
    const school = field({ fieldId: 'education-1/schoolName', label: 'School or University', semantic: 'education.school', recordKey: 'education-1', value: 'Example State University' });
    const p = propose(s([school, fos]), profile).proposals.find((x) => x.label === 'Field of Study');
    expect(p).toMatchObject({ kind: 'multiselect', proposed: 'Computer Science', safe: false });
  });
});

describe('per-entry answers (live QA 2026-10-11)', () => {
  const two = { ...profile, education: [
    { id: 'e1', school: 'First University', degree: 'MS', major: 'CS', start: '', end: '', status: '' as const, gpa: '3.9' },
    { id: 'e2', school: 'Second College', degree: 'BS', major: 'CS', start: '', end: '', status: '' as const, gpa: '3.5' },
  ] };
  const entry = (n: number, school: string, gpaField: Partial<ScannedField>) => [
    field({ fieldId: `education-${n}/school`, label: 'School', semantic: 'education.school', recordKey: `education-${n}`, value: school }),
    field({ fieldId: `education-${n}/gpa`, label: 'Overall Result (GPA)', recordKey: `education-${n}`, ...gpaField }),
  ];

  it("fills each school's own GPA", () => {
    const r = propose(s([...entry(1, 'First University', { semantic: 'education.gpa' }), ...entry(2, 'Second College', { semantic: 'education.gpa' })]), two);
    expect(r.proposals.filter((p) => p.label === 'Overall Result (GPA)').map((p) => p.proposed)).toEqual(['3.9', '3.5']);
  });

  it('never applies a saved answer to a field inside an entry', () => {
    const memories = [{ id: 'm', question: 'Overall Result (GPA)', kind: 'text' as const, answer: '3.47', options: [], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-11T00:00:00.000Z' }];
    const answers = { memories, sensitive: [], ctx: { tenantKey: 't', applicationId: 'a', employer: 'X', jobTitle: 'Y' } };
    // Control: the same field outside an entry does get the saved answer, so the test can't pass by accident.
    expect(propose(s([field({ fieldId: 'q', label: 'Overall Result (GPA)', value: '4' })]), two, {}, answers).proposals.map((p) => p.proposed)).toEqual(['3.47']);
    expect(propose(s(entry(2, 'Second College', { value: '4' })), two, {}, answers).proposals.find((p) => p.label === 'Overall Result (GPA)')).toBeUndefined();
  });
});


describe('remembered dates (live QA 2026-10-11)', () => {
  it('proposes a saved date answer, never as safe', () => {
    const memories = [{ id: 'm', question: 'Date Available', kind: 'text' as const, answer: '2027-05-17', options: [], scope: 'global' as const, tenantKey: '', applicationId: '', confirmedAt: '2026-10-11T00:00:00.000Z' }];
    const answers = { memories, sensitive: [], ctx: { tenantKey: 't', applicationId: 'a', employer: 'X', jobTitle: 'Y' } };
    const p = propose(s([field({ fieldId: 'avail', kind: 'date', label: 'Date Available' })]), profile, {}, answers).proposals[0];
    expect(p).toMatchObject({ kind: 'date', proposed: '2027-05-17', safe: false });
  });
});

describe('remembered search-box choices (2026-10-11)', () => {
  const answers = { memories: [], sensitive: [], ctx: { tenantKey: 't', applicationId: 'a', employer: 'X', jobTitle: 'Y' },
    optionAliases: [{ field: 'education.major', value: 'Computer Science', option: 'Computer and Information Science' }] };
  const school = field({ fieldId: 'education-1/school', label: 'School', semantic: 'education.school', recordKey: 'education-1', value: 'Example State University' });
  const fos = (value: string) => field({ fieldId: 'education-1/fos', kind: 'multiselect', label: 'Field of Study', semantic: 'education.major', recordKey: 'education-1', value });

  it('offers the option chosen before, remembering the profile value it stands for', () => {
    const p = propose(s([school, fos('')]), profile, {}, answers).proposals.find((x) => x.label === 'Field of Study');
    // Profile wording first, then the kept one: whichever the site lists is picked.
    expect(p).toMatchObject({ proposed: 'Computer Science' + String.fromCharCode(10) + 'Computer and Information Science', from: 'Computer Science', safe: false });
  });

  it('keeps several wordings for one value, and accepts any of them as already filled (live QA 2026-10-12)', () => {
    const more = { ...answers, optionAliases: [...answers.optionAliases, { field: 'education.major', value: 'Computer Science', option: 'Computer Sciences' }] };
    expect(propose(s([school, fos('')]), profile, {}, more).proposals.find((x) => x.label === 'Field of Study')?.proposed.split(String.fromCharCode(10)))
      .toEqual(['Computer Science', 'Computer and Information Science', 'Computer Sciences']);
    for (const v of ['Computer Science', 'Computer Sciences']) expect(propose(s([school, fos(v)]), profile, {}, more).proposals.find((x) => x.label === 'Field of Study')).toBeUndefined();
  });

  it('treats a field already showing that option as correct', () => {
    expect(propose(s([school, fos('Computer and Information Science')]), profile, {}, answers).proposals.find((x) => x.label === 'Field of Study')).toBeUndefined();
  });
});
