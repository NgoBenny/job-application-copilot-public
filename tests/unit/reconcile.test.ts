import { describe, expect, it } from 'vitest';
import { fromTailoredJson, TailoredResumeJSON } from '../../src/domain/resume/extract';
import { readResumeLines } from '../../src/domain/resume/pdf-text';
import { combine, reconcile } from '../../src/domain/resume/reconcile';
import example from '../../examples/tailored-resume.example.json';
import { sampleStore } from '../fixtures/data/profile';
import { RESUME_LINES } from '../fixtures/data/resume-text';

const json = () => fromTailoredJson(TailoredResumeJSON.parse(example));

describe('TailoredResumeJSON', () => {
  it('accepts the shipped example', () => expect(TailoredResumeJSON.safeParse(example).success).toBe(true));
  it('rejects unknown fields and bad urls', () => {
    expect(TailoredResumeJSON.safeParse({ ...example, password: 'x' }).success).toBe(false);
    expect(TailoredResumeJSON.safeParse({ ...example, links: [{ url: 'javascript:alert(1)' }] }).success).toBe(false);
  });
  it('accepts skills written as plain names, as tailoring chats do (live 2026-10-14)', () => {
    const j = fromTailoredJson(TailoredResumeJSON.parse({ ...example, skills: ['Python', 'SQL', { name: 'React' }] }));
    expect(j.skills.map((s) => s.name)).toEqual(['Python', 'SQL', 'React']);
    expect(TailoredResumeJSON.safeParse({ ...example, skills: [''] }).success).toBe(false);
  });
  it('accepts skills grouped by category (live 2026-10-15)', () => {
    const skills = { languages: ['Python', 'SQL'], tools: ['Git'] };
    expect(fromTailoredJson(TailoredResumeJSON.parse({ ...example, skills })).skills.map((s) => s.name)).toEqual(['Python', 'SQL', 'Git']);
  });
  it('drops entry fields it does not use, like project dates or technologies (live 2026-10-14/15)', () => {
    const projects = [{ name: 'Example Tracker', start: '2026', end: 'Present', technologies: 'Python, SQL', bullets: ['Built a thing'] }];
    expect(fromTailoredJson(TailoredResumeJSON.parse({ ...example, projects })).projects).toEqual([{ name: 'Example Tracker', bullets: ['Built a thing'] }]);
  });
  it('never imports job-description-only skills as the candidate\'s skills', () => {
    const j = fromTailoredJson(TailoredResumeJSON.parse({ ...example, skills: [{ name: 'Kubernetes', source: 'job' }, { name: 'React' }] }));
    expect(j.skills.map((s) => s.name)).toEqual(['React']);
    expect(j.warnings[0]).toMatch(/job description/);
  });
});

describe('combine', () => {
  it('accepts a matching PDF + JSON pair', () => {
    const c = combine(readResumeLines(RESUME_LINES, 'avery-acme-swe.pdf', 'abc'), json());
    expect(c.source).toBe('pdf+json');
    expect(c.pdfFingerprint).toBe('abc');
    expect(c.warnings).toEqual([]);
  });
  it('flags a mismatched pair', () => {
    const other = readResumeLines(['Jordan Sample', 'EXPERIENCE', 'Data Analyst — Globex Corporation — 2022 - 2024'], 'jordan-globex.pdf');
    const c = combine(other, json());
    expect(c.warnings.join('\n')).toMatch(/different jobs/);
    expect(c.warnings.join('\n')).toMatch(/name in the JSON does not match/);
    expect(c.warnings.join('\n')).toMatch(/not found in the PDF/);
  });
});

describe('reconcile', () => {
  const profile = sampleStore().profile;

  it('matches by identity and reports field differences', () => {
    const extract = readResumeLines(RESUME_LINES, 'r.pdf');
    extract.education[0]!.end = '2025-06';
    const r = reconcile(extract, profile);
    expect(r.education[0]!.master?.id).toBe('edu-1');
    expect(r.education[0]!.diffs).toEqual([
      { field: 'Degree', resume: 'Bachelor of Science', master: 'BS' },
      { field: 'End', resume: '2025-06', master: '2025-05' },
    ]);
    expect(r.employment[0]!.master?.id).toBe('emp-1');
    expect(r.employment[0]!.diffs).toEqual([]);
    expect(r.employment[1]!.master).toBeUndefined();
  });

  it('prefers an explicit masterRecordId over position', () => {
    const p = { ...profile, employment: [{ ...profile.employment[0]!, id: 'emp-9', employer: 'Other Co' }, ...profile.employment] };
    const extract = json();
    extract.experience[0]!.masterRecordId = 'emp-1';
    expect(reconcile(extract, p).employment[0]!.master?.id).toBe('emp-1');
  });

  it('leaves ambiguous same-employer jobs unmatched', () => {
    const p = { ...profile, employment: [profile.employment[0]!, { ...profile.employment[0]!, id: 'emp-2', title: 'Robotics Engineer' }] };
    const extract = readResumeLines(['EXPERIENCE', 'Acme Robotics | Product Manager | 2025 - Present'], 'r.pdf');
    expect(reconcile(extract, p).employment[0]!.master).toBeUndefined();
  });

  it('shows a current-versus-ended conflict', () => {
    const extract = readResumeLines(['EXPERIENCE', 'Software Engineering Intern | Acme Robotics | Jun 2024 - Present'], 'r.pdf');
    expect(reconcile(extract, profile).employment[0]!.diffs).toEqual([{ field: 'End', resume: 'Present', master: '2024-08' }]);
  });

  it('matches the right degree when several are at one school', () => {
    const p = { ...profile, education: [profile.education[0]!, { ...profile.education[0]!, id: 'edu-2', degree: 'MS', start: '2025-09', end: '2027-05' }] };
    const extract = readResumeLines(['EDUCATION', 'Example State University | 2025 - 2027', 'MS in Computer Science'], 'r.pdf');
    expect(reconcile(extract, p).education[0]!.master?.id).toBe('edu-2');
  });

  it('lists resume skills that are not in the verified inventory', () => {
    expect(reconcile(readResumeLines(RESUME_LINES, 'r.pdf'), profile).unverifiedSkills).toEqual(['Python', 'Rust', 'Node.js']);
  });
});
