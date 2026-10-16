import { describe, expect, it } from 'vitest';
import { migrate, parseBackup, parseUntrustedJson } from '../../src/domain/backup';
import { PartialDate, SafeUrl } from '../../src/domain/schemas';
import { sampleStore } from '../fixtures/data/profile';

const json = (v: unknown) => JSON.stringify(v);

describe('parseBackup', () => {
  it('round-trips a valid store', () => {
    const s = sampleStore();
    expect(parseBackup(json(s))).toEqual({ ok: true, value: s });
  });

  it.each([
    ['not JSON', '{', 'not valid JSON'],
    ['oversized', 'x'.repeat(2_000_001), 'larger than'],
    ['__proto__ key', '{"schemaVersion":1,"__proto__":{"polluted":true}}', 'forbidden key'],
    ['nested constructor key', '{"a":{"constructor":{"prototype":{}}}}', 'forbidden key'],
    ['unknown version', json({ ...sampleStore(), schemaVersion: 99 }), 'Unsupported schema version'],
    ['missing version', json({ profile: {} }), 'Unsupported schema version'],
    ['array root', '[]', 'Not a backup'],
    ['unknown field', json({ ...sampleStore(), password: 'x' }), 'Invalid data'],
    ['javascript: url', json({ ...sampleStore(), profile: { ...sampleStore().profile, links: [{ id: 'l', kind: 'other', label: '', url: 'javascript:alert(1)' }] } }), 'Invalid data at profile.links.0.url'],
  ])('rejects %s', (_name, text, error) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(error);
  });

  it('never echoes values in error text', () => {
    const s = sampleStore();
    const bad = { ...s, profile: { ...s.profile, contact: { ...s.profile.contact, email: 'secret-not-an-email' } } };
    const r = parseBackup(json(bad));
    expect(!r.ok && r.error).not.toContain('secret');
  });

  it('does not pollute Object.prototype', () => {
    parseUntrustedJson('{"__proto__":{"polluted":1}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('migrate', () => {
  it('applies steps in order and leaves the input untouched', () => {
    const input = { schemaVersion: 1, a: 1 };
    const r = migrate(input, { 1: (d) => ({ ...d, b: 2 }), 2: (d) => ({ ...d, c: 3 }) }, 3);
    expect(r).toEqual({ ok: true, value: { schemaVersion: 3, a: 1, b: 2, c: 3 } });
    expect(input).toEqual({ schemaVersion: 1, a: 1 });
  });

  it('reports a failing step without partial results', () => {
    const input = { schemaVersion: 1, a: 1 };
    const r = migrate(input, { 1: (d) => { (d as { a: number }).a = 2; throw new Error('boom'); } }, 2);
    expect(r).toEqual({ ok: false, error: 'Migration from version 1 failed.' });
    expect(input.a).toBe(1);
  });

  it('reports a missing step', () => {
    expect(migrate({ schemaVersion: 1 }, {}, 2)).toEqual({ ok: false, error: 'No migration from version 1.' });
  });
});

describe('field schemas', () => {
  it.each(['', '2024', '2024-01', '2024-12', ' 2024-05 '])('accepts date %s', (d) => expect(PartialDate.safeParse(d).success).toBe(true));
  it.each(['2024-13', '2024-1', '24', '2024-01-05', 'May 2024'])('rejects date %s', (d) => expect(PartialDate.safeParse(d).success).toBe(false));
  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com'])('rejects url %s', (u) => expect(SafeUrl.safeParse(u).success).toBe(false));
});

describe('education GPA (added 2026-10-11)', () => {
  it('imports a backup made before GPA existed, with an empty GPA', () => {
    const old = sampleStore();
    const { gpa: _gpa, ...withoutGpa } = old.profile.education[0]!;
    const r = parseBackup(JSON.stringify({ ...old, profile: { ...old.profile, education: [withoutGpa] } }));
    expect(r.ok && r.value.profile.education[0]!.gpa).toBe('');
  });
});

describe('long saved questions (live QA 2026-10-12)', () => {
  it('keeps a remembered question with a long definition, word for word', () => {
    const s = sampleStore();
    const question = `Do you have a close personal relationship with a current employee? ${'A close personal relationship includes relatives and household members. '.repeat(12)}`.trim();
    expect(question.length).toBeGreaterThan(500);
    s.answers = [{ id: 'm', question, kind: 'choice', answer: 'No', options: ['Yes', 'No'], scope: 'employer', tenantKey: 'https://x.wd1.myworkdayjobs.com/External', applicationId: '', confirmedAt: '2026-10-12T00:00:00.000Z' }];
    const r = parseBackup(JSON.stringify(s));
    expect(r.ok && r.value.answers[0]!.question).toBe(question);
  });
});
