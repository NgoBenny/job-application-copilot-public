const ABBREVIATIONS: Record<string, string> = { univ: 'university', u: 'university', inst: 'institute', tech: 'technology', coll: 'college', co: 'company', corp: 'corporation', inc: '', llc: '', ltd: '', the: '' };

/** Loose identity key for names of schools/employers/titles: case, punctuation and common abbreviations don't matter. */
export function nameKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter(Boolean)
    .join(' ');
}

/** Same entity if keys match or one key contains the other as whole words (e.g. "acme robotics" vs "acme robotics labs"). */
export function sameName(a: string, b: string): boolean {
  const ka = nameKey(a), kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [short, long] = ka.length < kb.length ? [ka, kb] : [kb, ka];
  return short.split(' ').length >= 2 && ` ${long} `.includes(` ${short} `);
}
