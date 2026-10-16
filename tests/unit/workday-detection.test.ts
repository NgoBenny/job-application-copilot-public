import { describe, expect, it } from 'vitest';
import { detectWorkday, isWorkdayHost, tenantKey } from '../../src/adapters/workday/detection';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const u = (s: string) => new URL(s);

describe('tenantKey', () => {
  it.each([
    ['https://acme.wd1.myworkdayjobs.com/en-US/External/job/Springfield/SWE_R-1', 'https://acme.wd1.myworkdayjobs.com/External'],
    ['https://acme.wd1.myworkdayjobs.com/External/apply', 'https://acme.wd1.myworkdayjobs.com/External'],
    ['https://acme.wd1.myworkdayjobs.com/fr/Campus', 'https://acme.wd1.myworkdayjobs.com/Campus'],
    ['https://wd3.myworkdaysite.com/recruiting/initech/Careers/job/x', 'https://wd3.myworkdaysite.com/recruiting/initech/Careers'],
    ['https://wd5.myworkday.com/globex/d/task/1.htmld', 'https://wd5.myworkday.com/globex'],
  ])('%s', (url, key) => expect(tenantKey(u(url))).toBe(key));

  it('keeps two employers on one host apart', () => {
    expect(tenantKey(u('https://wd3.myworkdaysite.com/recruiting/initech/Careers/a'))).not.toBe(tenantKey(u('https://wd3.myworkdaysite.com/recruiting/hooli/Careers/a')));
  });

  it('keeps two sites of one employer apart', () => {
    expect(tenantKey(u('https://acme.wd1.myworkdayjobs.com/External'))).not.toBe(tenantKey(u('https://acme.wd1.myworkdayjobs.com/Internal')));
  });

  it.each(['https://myworkdayjobs.com.evil.example/External', 'https://evilmyworkdayjobs.com/External', 'https://wd3.myworkdaysite.com/recruiting/'])(
    'returns undefined for %s', (url) => expect(tenantKey(u(url))).toBeUndefined());
});

describe('detectWorkday', () => {
  const marked = '<div data-automation-id="applyFlowPage"></div>';
  it('supports a Workday host with page markers', () => expect(detectWorkday(u('https://acme.wd1.myworkdayjobs.com/External/apply'), doc(marked)).status).toBe('supported'));
  it('is uncertain on a Workday host without markers', () => expect(detectWorkday(u('https://acme.wd1.myworkdayjobs.com/External'), doc('<p>hi</p>')).status).toBe('uncertain'));
  it('never supports a lookalike page on another host', () => expect(detectWorkday(u('https://jobs.example.com/External'), doc(marked)).status).toBe('unsupported'));
  it('rejects lookalike hosts', () => expect(isWorkdayHost('myworkdayjobs.com.evil.example')).toBe(false));
});
