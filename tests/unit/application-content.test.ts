import { describe, expect, it } from 'vitest';
import { propose } from '../../src/domain/plan';
import { Application } from '../../src/domain/schemas';
import type { ScannedField, ScanSnapshot } from '../../src/platform/adapter';
import { sampleStore } from '../fixtures/data/profile';

const profile = sampleStore().profile;
const content = { approved: true, educationIds: [], employment: [{ masterId: 'emp-1', description: 'Tailored and verified wording' }], projects: [] };
const field = (key: string, value = ''): ScannedField => ({ fieldId: key, label: key, kind: key === 'description' ? 'textarea' : 'text', section: 'Experience', recordKey: 'workExperience-1', semantic: `employment.${key}`, value, required: false, disabled: false });
const snapshot: ScanSnapshot = { stepId: 'experience', stepLabel: 'Experience', revision: 0, errors: [], fields: [field('employer', 'Acme Robotics'), field('title'), field('start'), field('description')] };

describe('application-specific content', () => {
  it('uses approved wording while factual fields and the master profile stay canonical', () => {
    const before = structuredClone(profile);
    const plan = propose(snapshot, profile, {}, undefined, content);
    expect(plan.proposals.find((p) => p.fieldId === 'description')).toMatchObject({ proposed: content.employment[0]!.description, provenance: 'approved application', safe: false });
    expect(plan.proposals.find((p) => p.fieldId === 'title')).toMatchObject({ proposed: profile.employment[0]!.title, provenance: 'master' });
    expect(plan.proposals.find((p) => p.fieldId === 'start')?.proposed).toBe('2024-06');
    expect(profile).toEqual(before);
    expect(propose(snapshot, profile).proposals.find((p) => p.fieldId === 'description')?.proposed).toBe('Built a test harness');
  });

  it('leaves record fills pending when application content is not approved', () => {
    const plan = propose(snapshot, profile, {}, undefined, { ...content, approved: false });
    expect(plan.proposals).toEqual([]);
    expect(plan.notes.some((n) => /review/i.test(n.reason))).toBe(true);
  });

  it('compares a multiline description as a whole and is idempotent after filling it', () => {
    const multiline = { ...content, employment: [{ masterId: 'emp-1', description: 'First verified bullet\nSecond verified bullet' }] };
    const page = (value: string) => ({ ...snapshot, fields: snapshot.fields.map((f) => f.fieldId === 'description' ? { ...f, value } : f) });
    expect(propose(page('First verified bullet'), profile, {}, undefined, multiline).proposals.find((p) => p.fieldId === 'description')?.proposed).toBe(multiline.employment[0]!.description);
    expect(propose(page(multiline.employment[0]!.description), profile, {}, undefined, multiline).proposals.some((p) => p.fieldId === 'description')).toBe(false);
  });

  it('does not propose excluded records or missing records that were not selected', () => {
    const expanded = { ...profile, employment: [...profile.employment, { ...profile.employment[0]!, id: 'emp-2', employer: 'Other Company' }] };
    const plan = propose(snapshot, expanded, {}, undefined, content);
    expect(plan.missing).toEqual([]);
    const empty = propose(snapshot, expanded, {}, undefined, { ...content, employment: [] });
    expect(empty.proposals).toEqual([]);
  });

  it('never resurrects a selected record removed from the master profile', () => {
    expect(propose(snapshot, { ...profile, employment: [] }, {}, undefined, content).proposals).toEqual([]);
  });

  it('does not relabel an excluded job as the selected job at the same employer', () => {
    const expanded = { ...profile, employment: [...profile.employment, { ...profile.employment[0]!, id: 'emp-2', title: 'Robotics Engineer' }] };
    const page = { ...snapshot, fields: snapshot.fields.map((f) => f.fieldId === 'title' ? { ...f, value: 'Software Engineering Intern' } : f) };
    const selected = { ...content, employment: [{ masterId: 'emp-2', description: 'Engineer wording' }] };
    const plan = propose(page, expanded, {}, undefined, selected);
    expect(plan.proposals.filter((p) => p.type === 'set')).toEqual([]);
    expect(plan.missing.map((r) => r.masterId)).toEqual(['emp-2']);
  });

  it('pairs an empty page entry with a selected record instead of an excluded record', () => {
    const expanded = { ...profile, employment: [...profile.employment, { ...profile.employment[0]!, id: 'emp-2', employer: 'Other Company' }] };
    const selected = { ...content, employment: [{ masterId: 'emp-2', description: 'Other wording' }] };
    const plan = propose({ ...snapshot, fields: snapshot.fields.map((f) => ({ ...f, value: '' })) }, expanded, {}, undefined, selected);
    expect(plan.proposals.find((p) => p.fieldId === 'employer')?.proposed).toBe('Other Company');
    expect(plan.missing).toEqual([]);
  });

  it('keeps old application records valid and rejects factual overrides in content', () => {
    const now = '2026-10-22T00:00:00.000Z';
    const old = { id: 'a1', platformId: 'workday', employerLabel: '', jobTitle: '', jobUrl: '', portalOrigin: '', tenantKey: '', jobDescription: '', persistJobDescription: false, resumeImportMethod: 'none', reviewed: false, skillSelections: [], submittedAt: '', stepsSeen: [], createdAt: now, updatedAt: now };
    expect(Application.safeParse(old).success).toBe(true);
    expect(Application.safeParse({ ...old, content }).success).toBe(true);
    expect(Application.safeParse({ ...old, content: { ...content, employment: [{ ...content.employment[0], title: 'Invented title' }] } }).success).toBe(false);
    expect(Application.safeParse({ ...old, content: { ...content, employment: [...content.employment, ...content.employment] } }).success).toBe(false);
  });
});
