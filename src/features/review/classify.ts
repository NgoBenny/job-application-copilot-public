import type { ScannedField, ScanSnapshot } from '../../platform/adapter';

export type ReviewGroup = 'recognized' | 'needsReview' | 'protected' | 'unsupported';

export const GROUP_TITLES: Record<ReviewGroup, string> = {
  recognized: 'Recognized',
  needsReview: 'Needs review',
  protected: 'You answer these',
  unsupported: 'Not supported (do it by hand)',
};

/** Honest buckets for a scanned step. Nothing here claims a field is filled or correct. */
export function groupOf(f: ScannedField): ReviewGroup {
  if (f.protection) return 'protected';
  if (f.kind === 'file' || f.kind === 'unknown') return 'unsupported';
  if (f.uncertain || !f.semantic) return 'needsReview';
  return 'recognized';
}

export function summarize(s: ScanSnapshot) {
  const groups: Record<ReviewGroup, ScannedField[]> = { recognized: [], needsReview: [], protected: [], unsupported: [] };
  for (const f of s.fields) groups[groupOf(f)].push(f);
  const missingRequired = s.fields.filter((f) => f.required && f.value === '');
  return { groups, missingRequired, errors: s.errors };
}
