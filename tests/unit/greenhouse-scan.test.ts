import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectGreenhouse, tenantKey } from '../../src/adapters/greenhouse/detection';
import { scanGreenhouse } from '../../src/adapters/greenhouse/scan';
// @ts-expect-error plain JS fixture helper
import { install } from '../fixtures/greenhouse/react-select-like.js';

const HTML = readFileSync('tests/fixtures/greenhouse/acme/jobs/1001.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const URL_ = new URL('https://job-boards.greenhouse.io/acme/jobs/1001?utm_source=x');

describe('greenhouse detection', () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; });

  it('supports a job-boards form and keys the employer by board token', () => {
    expect(detectGreenhouse(URL_, document)).toMatchObject({ status: 'supported', tenantKey: 'https://job-boards.greenhouse.io/acme' });
    expect(tenantKey(new URL('https://boards.greenhouse.io/other/jobs/5'))).toBe('https://boards.greenhouse.io/other');
  });
  it('is uncertain on a Greenhouse page without the form, and unsupported elsewhere', () => {
    document.body.innerHTML = '<main>Job description</main>';
    expect(detectGreenhouse(URL_, document).status).toBe('uncertain');
    expect(detectGreenhouse(new URL('https://greenhouse.example.com/acme/jobs/1'), document).status).toBe('unsupported');
  });
});

describe('greenhouse scan (live structure 2026-10-12)', () => {
  beforeEach(() => { document.documentElement.innerHTML = HTML; install(document); });
  const fields = () => scanGreenhouse(document, 1).snapshot.fields;
  const by = (id: string) => fields().find((f) => f.fieldId === id);

  it('maps contact fields and reads one field per dropdown, never the validation decoys', () => {
    expect(by('first_name')).toMatchObject({ kind: 'text', label: 'First Name', semantic: 'contact.firstName', required: true, value: '' });
    expect(by('phone')).toMatchObject({ kind: 'text', semantic: 'contact.phone' });
    expect(by('country')).toMatchObject({ kind: 'dropdown', semantic: 'contact.country', value: '' });
    expect(by('candidate-location')).toMatchObject({ kind: 'dropdown', label: 'Location (City)', semantic: 'contact.location' });
    expect(by('resume')).toMatchObject({ kind: 'file', semantic: 'resume.file' });
    expect(by('question_101')).toMatchObject({ label: 'LinkedIn Profile', semantic: 'links.linkedin' });
    expect(fields().every((f) => f.fieldId)).toBe(true);
    expect(fields().filter((f) => f.kind === 'dropdown')).toHaveLength(13);
  });

  it('groups the education block as one record with split month/year dates', () => {
    expect(by('school--0')).toMatchObject({ kind: 'dropdown', semantic: 'education.school', recordKey: 'education-1', section: 'Education' });
    expect(by('end-month--0')).toMatchObject({ semantic: 'education.endMonth', recordKey: 'education-1' });
    expect(by('end-year--0')).toMatchObject({ kind: 'text', semantic: 'education.endYear', recordKey: 'education-1' });
  });

  it('reads a chosen dropdown value from the shown choice, not the search box', () => {
    const box = document.getElementById('degree--0')!.closest('.select__value-container')!;
    box.querySelector('.select__placeholder')!.outerHTML = '<div class="select__single-value">Bachelor&#39;s Degree</div>';
    expect(by('degree--0')?.value).toBe("Bachelor's Degree");
  });

  it('protects sensitive, acknowledgement and EEO questions before reading values', () => {
    expect(by('question_102')).toMatchObject({ protection: 'authorization' });
    expect(by('question_104')).toMatchObject({ protection: 'attestation' });
    expect(by('question_104')).not.toHaveProperty('value');
    expect(by('gender')).toMatchObject({ protection: 'demographic', section: 'Voluntary Self-Identification' });
    expect(by('veteran_status')).toMatchObject({ protection: 'demographic' });
  });

  it('treats a checkbox group as one choice question named by its legend', () => {
    expect(by('question_105[]')).toMatchObject({ kind: 'radio', label: 'Select all locations you would be open to', options: ['Springfield', 'Example City'], value: '' });
  });

  it('never treats a dropdown that mentions LinkedIn as your LinkedIn link (review 2026-10-12)', () => {
    document.getElementById('question_103-label')!.firstChild!.textContent = 'Did you find this job on LinkedIn?';
    expect(by('question_103')).not.toHaveProperty('semantic');
  });

  it('skips the phone widget hidden search box (live Greenhouse board 1 2026-10-12: it showed as "(no label)")', () => {
    expect(fields().find((f) => f.fieldId.startsWith('iti-'))).toBeUndefined();
    expect(fields().filter((f) => !f.label)).toEqual([]);
  });

  it('reads a multi-answer dropdown as a dropdown holding its chosen answers (live Greenhouse board 3 2026-10-13)', () => {
    const box = document.getElementById('question_103')!.closest('.select__value-container')!;
    box.classList.add('select__value-container--is-multi');
    expect(by('question_103')).toMatchObject({ kind: 'dropdown', value: '' });
    box.insertAdjacentHTML('beforeend', '<div class="select__multi-value"><div class="select__multi-value__label">Referral</div></div>');
    expect(by('question_103')?.value).toBe('Referral');
  });
});
