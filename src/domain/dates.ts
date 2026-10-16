import type { PartialDate } from './schemas';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const DATE_RE = String.raw`\b(?:${MONTH_RE}\s+\d{4}|\d{1,2}/\d{4}|\d{4}-\d{2}|\d{4})\b`;
const END_RE = String.raw`(?:${DATE_RE}|present|current|now)`;
const RANGE = new RegExp(String.raw`(${DATE_RE})\s*(?:-|–|—|to|until)\s*(${END_RE})`, 'i');
const SINGLE = new RegExp(String.raw`(?:expected\s+|graduat\w*\s+)?(${DATE_RE})`, 'i');
const SINGLE_ALL = new RegExp(SINGLE.source, 'ig');

/** Parses one resume date. Returns undefined rather than guessing; never invents a month. */
export function parseResumeDate(s: string): PartialDate | 'present' | undefined {
  const t = s.trim().toLowerCase();
  if (/^(present|current|now)$/.test(t)) return 'present';
  const m = t.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m) {
    const word = m[1]!;
    const i = word.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(word)) : -1;
    return i < 0 ? undefined : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})$/), slash = t.match(/^(\d{1,2})\/(\d{4})$/);
  const [year, month] = iso ? [iso[1]!, iso[2]!] : slash ? [slash[2]!, slash[1]!] : [];
  if (year && month) return Number(month) >= 1 && Number(month) <= 12 ? `${year}-${month.padStart(2, '0')}` : undefined;
  return /^\d{4}$/.test(t) ? t : undefined;
}

export type DateRange = { start: PartialDate; end: PartialDate; current: boolean };

/** Finds "Start – End" in a line; a lone date (e.g. graduation) becomes the end. */
export function findDateRange(line: string): DateRange | undefined {
  const r = line.match(RANGE);
  if (r) {
    const start = parseResumeDate(r[1]!), end = parseResumeDate(r[2]!);
    if (start && start !== 'present' && end) return { start, end: end === 'present' ? '' : end, current: end === 'present' };
  }
  const s = line.match(SINGLE);
  const d = s && parseResumeDate(s[1]!);
  return d && d !== 'present' ? { start: '', end: d, current: false } : undefined;
}

/** Removes the date text so the rest of the line can be read as title/employer. */
export function stripDates(line: string): string {
  return line.replace(RANGE, '').replace(SINGLE_ALL, '').replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, '').trim();
}
