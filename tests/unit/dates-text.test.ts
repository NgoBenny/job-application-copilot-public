import { describe, expect, it } from 'vitest';
import { findDateRange, parseResumeDate, stripDates } from '../../src/domain/dates';
import { nameKey, sameName } from '../../src/domain/text';

describe('parseResumeDate', () => {
  it.each([
    ['May 2024', '2024-05'], ['Sept. 2023', '2023-09'], ['september 2023', '2023-09'], ['05/2024', '2024-05'], ['5/2024', '2024-05'],
    ['2024-05', '2024-05'], ['2024', '2024'], ['Present', 'present'], ['current', 'present'],
  ])('%s → %s', (s, want) => expect(parseResumeDate(s)).toBe(want));
  it.each(['13/2024', '2024-13', 'Smarch 2024', 'spring', '', '24'])('rejects %s', (s) => expect(parseResumeDate(s)).toBeUndefined());
});

describe('findDateRange', () => {
  it('reads month ranges', () => expect(findDateRange('Acme Robotics | Jun 2024 – Aug 2024')).toEqual({ start: '2024-06', end: '2024-08', current: false }));
  it('reads open ranges', () => expect(findDateRange('Engineer, 2023 - Present')).toEqual({ start: '2023', end: '', current: true }));
  it('reads a lone graduation date as the end', () => expect(findDateRange('Expected May 2026')).toEqual({ start: '', end: '2026-05', current: false }));
  it('never invents a month for a year-only range', () => expect(findDateRange('2021 – 2025')).toEqual({ start: '2021', end: '2025', current: false }));
  it('returns undefined when no date', () => expect(findDateRange('Software Engineer')).toBeUndefined());
  it('strips dates and separators', () => expect(stripDates('Acme Robotics | Jun 2024 – Aug 2024')).toBe('Acme Robotics'));
});

describe('names', () => {
  it('ignores case, punctuation and abbreviations', () => expect(nameKey('The Example State Univ.')).toBe('example state university'));
  it('treats suffixes as the same employer', () => expect(sameName('Acme Robotics, Inc.', 'acme robotics')).toBe(true));
  it('matches a longer official name', () => expect(sameName('Acme Robotics', 'Acme Robotics Labs')).toBe(true));
  it('does not match single-word fragments', () => expect(sameName('Acme', 'Acme Robotics')).toBe(false));
  it('does not match different schools', () => expect(sameName('Example State University', 'Example University')).toBe(false));
});
