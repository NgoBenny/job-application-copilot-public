import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { handle, isTrustedSender } from '../../src/browser/store-service';
import { sampleStore } from '../fixtures/data/profile';
import { MAX_IMPORT_BYTES } from '../../src/domain/backup';

(globalThis as { chrome?: unknown }).chrome = fakeBrowser;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = async (): Promise<any> => (await fakeBrowser.storage.local.get('store')).store;

describe('store service', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns an empty store when nothing is saved', async () => {
    const r = await handle({ type: 'store/get' });
    expect(r.ok && r.store.revision).toBe(0);
  });

  it('saves a valid store and bumps the revision', async () => {
    const r = await handle({ type: 'store/save', store: sampleStore() });
    expect(r.ok && r.store.revision).toBe(1);
    expect((await raw()).profile.contact.firstName).toBe('Avery');
  });

  it('refuses a save based on an old revision', async () => {
    await handle({ type: 'store/save', store: sampleStore() });
    const r = await handle({ type: 'store/save', store: { ...sampleStore(), profile: { ...sampleStore().profile, skills: [] } } });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('another window') });
    expect((await raw()).profile.skills).toHaveLength(2);
  });

  it('serializes concurrent saves so only one wins', async () => {
    const results = await Promise.all([handle({ type: 'store/save', store: sampleStore() }), handle({ type: 'store/save', store: sampleStore() })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it.each([
    ['malformed', '{oops'],
    ['polluted', '{"schemaVersion":1,"__proto__":{}}'],
    ['oversized', 'x'.repeat(MAX_IMPORT_BYTES + 1)],
    ['future version', JSON.stringify({ ...sampleStore(), schemaVersion: 99 })],
  ])('a %s import leaves the store untouched', async (_n, text) => {
    await handle({ type: 'store/save', store: sampleStore() });
    const before = await raw();
    expect((await handle({ type: 'store/import', text })).ok).toBe(false);
    expect(await raw()).toEqual(before);
  });

  it('never overwrites corrupt saved data on save, but allows import', async () => {
    await fakeBrowser.storage.local.set({ store: { schemaVersion: 1, revision: 3, profile: 'garbage' } });
    expect((await handle({ type: 'store/get' })).ok).toBe(false);
    expect((await handle({ type: 'store/save', store: sampleStore() })).ok).toBe(false);
    expect((await raw()).profile).toBe('garbage');
    const r = await handle({ type: 'store/import', text: JSON.stringify(sampleStore()) });
    expect(r.ok && r.store.revision).toBe(1);
  });

  it('migrates a v1 store on read', async () => {
    const { applications: _a, ...v1 } = { ...sampleStore(), schemaVersion: 1 };
    await fakeBrowser.storage.local.set({ store: v1 });
    const r = await handle({ type: 'store/get' });
    expect(r.ok && r.store).toMatchObject({ schemaVersion: 5, applications: [], skillAliases: [], answers: [], sensitiveAnswers: [], accounts: [] });
  });

  it('drops job descriptions that were not opted in to', async () => {
    const now = new Date().toISOString();
    const app = { id: 'a1', platformId: 'workday' as const, employerLabel: 'Acme', jobTitle: 'SWE', jobUrl: '', portalOrigin: '', tenantKey: '', jobDescription: 'Long JD', persistJobDescription: false, resumeImportMethod: 'none' as const, reviewed: false, skillSelections: [], submittedAt: '', stepsSeen: [], createdAt: now, updatedAt: now };
    await handle({ type: 'store/save', store: { ...sampleStore(), applications: [app, { ...app, id: 'a2', persistJobDescription: true }] } });
    expect((await raw()).applications.map((a: { jobDescription: string }) => a.jobDescription)).toEqual(['', 'Long JD']);
  });

  it('wipe clears everything', async () => {
    await handle({ type: 'store/save', store: sampleStore() });
    await handle({ type: 'store/wipe' });
    expect(await raw()).toBeUndefined();
  });
});

describe('isTrustedSender', () => {
  const origin = fakeBrowser.runtime.getURL('');
  it('accepts extension pages', () => expect(isTrustedSender({ id: fakeBrowser.runtime.id, url: `${origin}options.html` })).toBe(true));
  it('rejects content scripts', () => expect(isTrustedSender({ id: fakeBrowser.runtime.id, url: 'https://acme.wd1.myworkdayjobs.com/x', tab: { id: 1 } as chrome.tabs.Tab })).toBe(false));
  it('rejects other extensions', () => expect(isTrustedSender({ id: 'other', url: `${origin}options.html` })).toBe(false));
});
