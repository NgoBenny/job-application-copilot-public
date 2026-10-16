import { describe, expect, it } from 'vitest';
import { semanticFor } from '../../src/adapters/workday/semantics';

describe('semanticFor: date labels with a note (live QA 2026-10-12, Workday employer 5)', () => {
  // Workday employer 5's year boxes carry no known automation id, so the label alone must say what they are.
  it.each([
    ['To (Actual or Expected)', 'education-2', 'education.end'],
    ['From', 'education-2', 'education.start'],
    ['To (Actual or Expected)', 'workExperience-1', 'employment.end'],
  ])('maps "%s" in %s to %s', (label, record, semantic) => expect(semanticFor('', label, record, 'Education')).toBe(semantic));
  it('leaves an unrelated "To" question alone outside records', () => expect(semanticFor('', 'To (Actual or Expected)', undefined, 'Questions')).toBeUndefined());
});
