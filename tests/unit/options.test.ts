import { describe, expect, it } from 'vitest';
import { exactChoice, matchOption } from '../../src/domain/options';

const degrees = ['Associate (AA)', 'Bachelor of Science (BS)', 'Master of Science (MS)'];

describe('matchOption', () => {
  it('prefers exact text', () => expect(matchOption(['Yes', 'No'], 'no')).toBe(1));
  it('matches by name key', () => expect(matchOption(['United States of America', 'Canada'], 'united states of america.')).toBe(0));
  it('matches a unique containing option', () => expect(matchOption(degrees, 'BS')).toBe(1));
  it('refuses ambiguous containment', () => expect(matchOption(degrees, 'Science')).toBe('ambiguous'));
  it('returns -1 when nothing fits', () => expect(matchOption(degrees, 'PhD')).toBe(-1));
  it('never matches on an empty value', () => expect(matchOption(['', 'A'], '')).toBe(-1));
  it('does not treat a partial word as a match', () => expect(matchOption(['Canada', 'Canary Islands'], 'Can')).toBe(-1));

  // Live QA 2026-10-10: a tenant listed degrees only as abbreviations.
  const abbreviated = ['High School', 'B.A.', 'B.S.', 'M.A.', 'M.S.', 'MBA', 'JD', 'Ph.D.'];
  it.each([
    ['Masters of Science', 'M.S.'], ["Master's of Science", 'M.S.'], ['Bachelors of Science', 'B.S.'], ['Bachelor of Arts', 'B.A.'],
    ['Master of Business Administration', 'MBA'], ['Doctor of Philosophy', 'Ph.D.'], ['Juris Doctor', 'JD'], ['BS', 'B.S.'], ['Master of Science in Computer Science', 'M.S.'],
  ])('maps the degree "%s" to its abbreviation %s', (want, option) => expect(matchOption(abbreviated, want)).toBe(abbreviated.indexOf(option)));
  // Live QA 2026-10-12 (Workday employer 7): "Name (abbreviation)" options.
  const tagged = ['Bachelor of Science (B.S)', 'Master of Science (M.S.)', 'Master of Arts (M.A.)'];
  it('maps a degree to a "Name (abbreviation)" option', () => expect(matchOption(tagged, 'Masters of Science')).toBe(1));
  it('maps an abbreviation to a "Name (abbreviation)" option', () => expect(matchOption(tagged, 'BS')).toBe(0));
  it('ignores a contradictory option', () => expect(matchOption(['Master of Science (B.S.)'], 'Masters of Science')).toBe(-1));
  it('treats short and long country names as the same (live Greenhouse 2026-10-12)', () => {
    expect(matchOption(['Canada', 'United States'], 'United States of America')).toBe(1);
    expect(matchOption(['United States'], 'USA')).toBe(0);
  });
  it('maps an abbreviation to a spelled-out option', () => expect(matchOption(['Bachelor of Science', 'Master of Science'], 'M.S.')).toBe(1));
  it('refuses when two options mean the same degree', () => expect(matchOption(['M.S.', 'MS'], 'Master of Science')).toBe('ambiguous'));
  it('leaves non-degree values alone', () => expect(matchOption(['MS', 'CA'], 'Mississippi')).toBe(-1));
  // Live QA 2026-10-11 (employer 2): degrees listed only by level.
  const levels = ['High School', 'Associates', 'Bachelors', 'Masters', 'Doctorate'];
  it.each([
    ['Masters of Science', 'Masters'], ['Bachelors of Science', 'Bachelors'], ['M.S.', 'Masters'], ['Master of Business Administration', 'Masters'],
    ['Doctor of Philosophy', 'Doctorate'], ['Associate of Arts', 'Associates'],
  ])('maps "%s" to the level-only option %s', (want, option) => expect(matchOption(levels, want)).toBe(levels.indexOf(option)));
  it("maps to \"Master's Degree\" style options", () => expect(matchOption(["Bachelor's Degree", "Master's Degree"], 'Masters of Science')).toBe(1));
  it('prefers the exact degree over its level', () => expect(matchOption(['Masters', 'M.S.', 'M.A.'], 'Master of Science')).toBe(1));
  it('refuses when two options share the level', () => expect(matchOption(['Masters', "Master's Degree"], 'Master of Science')).toBe('ambiguous'));
});

describe('exactChoice (sensitive answers)', () => {
  // Live QA 2026-10-11: every ethnicity option carried "(United States of America)" (user decision: ignore shared tags only).
  const tagged = ['American Indian or Alaska Native (United States of America)', 'Asian (United States of America)', 'Black or African American (United States of America)', 'I do not wish to answer'];
  it('ignores a bracketed tag that several options share', () => expect(exactChoice(tagged, 'Asian')).toBe(1));
  it('never ignores a one-off clarification', () => expect(exactChoice(['Yes (I will require sponsorship)', 'No'], 'Yes')).toBe(-1));
  it('still needs the whole remaining text to match', () => expect(exactChoice(['Asian Indian (X)', 'South Asian (X)'], 'Asian')).toBe(-1));
  it('prefers an option that matches exactly', () => expect(exactChoice(['Asian', 'Asian (X)', 'Black (X)'], 'Asian')).toBe(0));
  it('refuses when two tagged options mean the same', () => expect(exactChoice(['Asian (X)', 'Asian (Y)', 'Black (X)', 'Black (Y)'], 'Asian')).toBe(-1));
  it('never matches an empty answer', () => expect(exactChoice(tagged, '')).toBe(-1));
  // Several wordings, one per line (live QA 2026-10-12: Workday employer 6 words the veteran and ethnicity choices differently).
  const wordings = ['Asian (Not Hispanic or Latino) (United States of America)', 'White (Not Hispanic or Latino) (United States of America)'];
  it('accepts any one of several wordings', () => expect(exactChoice(wordings, 'Asian\nAsian (Not Hispanic or Latino)')).toBe(0));
  it('refuses when two wordings land on different options', () => expect(exactChoice(['I am not a veteran', 'I am not a protected veteran'], 'I am not a veteran\nI am not a protected veteran')).toBe('ambiguous'));
  it('treats curly and straight apostrophes as the same', () => expect(exactChoice(['Yes', 'No, I don’t have a disability'], "No, I don't have a disability")).toBe(1));
  it('ignores blank lines', () => expect(exactChoice(['No', 'Yes'], 'No\n')).toBe(0));
});

