import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectAshby, tenantKey } from '../../src/adapters/ashby/detection';
import { scanAshby } from '../../src/adapters/ashby/scan';

const HTML = readFileSync('tests/fixtures/ashby/acme/0f1e2d3c-0000-4000-8000-000000000001/application.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const APPLY = new URL('https://jobs.ashbyhq.com/acme/0f1e2d3c-0000-4000-8000-000000000001/application?utm_source=x');

describe('ashby detection', () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; });

  it('supports an application form and keys the employer by its board name', () => {
    expect(detectAshby(APPLY, document)).toMatchObject({ status: 'supported', tenantKey: 'https://jobs.ashbyhq.com/acme' });
    expect(tenantKey(new URL('https://jobs.ashbyhq.com/other/123'))).toBe('https://jobs.ashbyhq.com/other');
  });
  it('is uncertain on a job page without the form, and unsupported elsewhere', () => {
    document.body.innerHTML = '<main><h1>Job description</h1></main>';
    expect(detectAshby(APPLY, document).status).toBe('uncertain');
    document.documentElement.innerHTML = HTML;
    expect(detectAshby(new URL('https://jobs.ashbyhq.com/acme/0f1e2d3c-0000-4000-8000-000000000001'), document).status).toBe('uncertain'); // description tab
    expect(detectAshby(new URL('https://ashbyhq.example.com/acme/1/application'), document).status).toBe('unsupported');
  });
});

describe('ashby scan (live structure 2026-10-16)', () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; });
  const fields = () => scanAshby(document, 1).snapshot.fields;
  const by = (label: string) => fields().find((f) => f.label === label);

  it('reads one field per question block, named by its title', () => {
    expect(by('Name')).toMatchObject({ kind: 'text', semantic: 'contact.fullName', required: true, value: '' });
    expect(by('Email')).toMatchObject({ kind: 'text', semantic: 'contact.email' });
    expect(by('Phone Number')).toMatchObject({ kind: 'text', semantic: 'contact.phone' });
    expect(by('LinkedIn')).toMatchObject({ kind: 'text', semantic: 'links.linkedin' });
    expect(by('Resume')).toMatchObject({ kind: 'file', semantic: 'resume.file' });
    expect(by('Current Location')).toMatchObject({ kind: 'dropdown', semantic: 'contact.location', value: '' });
    expect(by('Why do you want to work at Acme?')).toMatchObject({ kind: 'textarea' });
  });

  it('knows common phone labels (review 2026-10-16)', () => {
    document.querySelector('[data-field-path="a1a1a1a1-0000-4000-8000-000000000001"] label')!.textContent = 'Mobile Phone';
    expect(by('Mobile Phone')).toMatchObject({ semantic: 'contact.phone' });
  });

  it('reads Yes/No buttons as a two-choice question and the pressed button as its value', () => {
    expect(by('Are you able to work in the office 4 days a week?')).toMatchObject({ kind: 'radio', options: ['Yes', 'No'], value: '' });
    document.querySelector('[data-field-path="a1a1a1a1-0000-4000-8000-000000000004"] [data-option="no"]')!.setAttribute('aria-pressed', 'true');
    expect(by('Are you able to work in the office 4 days a week?')?.value).toBe('No');
  });

  it('protects sensitive questions before reading them', () => {
    expect(by('Are you legally authorized to work in the country in which the job you are applying for is located?')).toMatchObject({ kind: 'radio', protection: 'authorization' });
    expect(by('Will you now or in the future require Acme to sponsor an immigration case?')).toMatchObject({ kind: 'textarea', protection: 'authorization' });
    expect(by('Gender')).toMatchObject({ kind: 'radio', protection: 'demographic', options: ['Male', 'Female', 'Decline to self-identify'] });
    expect(by('Veteran Status')).toMatchObject({ protection: 'demographic' });
  });

  it('never lists the resume-autofill box, the CAPTCHA or anything outside the question blocks', () => {
    expect(fields().map((f) => f.label)).not.toContain('Autofill from resume');
    expect(fields().find((f) => /recaptcha/i.test(f.fieldId))).toBeUndefined();
    expect(fields()).toHaveLength(13);
  });
});
