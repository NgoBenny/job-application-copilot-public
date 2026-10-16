import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pageKind } from '../../src/adapters/workday/page-kind';

const load = (path: string) => { document.documentElement.innerHTML = readFileSync(`tests/fixtures/workday/acme/en-US/External/${path}`, 'utf8'); return pageKind(document); };

describe('pageKind', () => {
  it.each([
    ['login.html', 'signIn', ['Google']],
    ['create-account.html', 'createAccount', []],
    ['verify-email.html', 'verifyEmail', []],
    ['apply/confirmation.html', 'confirmation', []],
    ['apply/my-information.html', 'application', []],
    ['job/index.html', 'unknown', []],
  ])('%s → %s', (path, kind, sso) => expect(load(path)).toEqual({ kind, sso }));

  it('never calls a page with form fields a confirmation', () => {
    document.body.innerHTML = '<p>Thank you for applying</p><input id="x">';
    expect(pageKind(document).kind).not.toBe('confirmation');
  });
});

describe('account pages', () => {
  it('treat every field, even a bare "Code" box, as a sign-in secret whose value is never read', async () => {
    const { scanWorkday } = await import('../../src/adapters/workday/scan');
    document.body.innerHTML = '<div data-automation-id="signInContent"><label for="c">Code</label><input id="c" value="123456"><label for="p">Password</label><input id="p" type="password"></div>';
    const fields = scanWorkday(document, 0).snapshot.fields;
    expect(fields.map((f) => [f.label, f.protection, 'value' in f])).toEqual([['Code', 'credential', false], ['Password', 'credential', false]]);
  });
});
