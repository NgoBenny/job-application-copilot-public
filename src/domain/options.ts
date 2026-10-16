import { nameKey } from './text';

// Typographic quotes are the same character for matching: "don’t" = "don't" (live Greenhouse board 3 2026-10-13).
export const straightQuotes = (s: string) => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
const norm = (s: string) => straightQuotes(s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Picks the visible option for a wanted value, by text, never by position.
 * Exact text → same name key → a unique option containing the wanted words (e.g. "BS" in "Bachelor of Science (BS)").
 * Returns -1 when nothing fits and 'ambiguous' when several do, so the caller leaves the field alone.
 */
// Short and long names of the same country: "United States" = "United States of America" = "USA" (live Greenhouse 2026-10-12).
const COUNTRY: Record<string, string> = { 'united states of america': 'united states', usa: 'united states', 'u s a': 'united states', 'u s': 'united states', uk: 'united kingdom', 'great britain': 'united kingdom' };
const placeKey = (s: string) => { const k = nameKey(s); return COUNTRY[k] ?? k; };

export function matchOption(options: readonly string[], want: string): number | 'ambiguous' {
  if (!want.trim()) return -1;
  const exact = options.findIndex((o) => norm(o) === norm(want));
  if (exact >= 0) return exact;
  const key = nameKey(want);
  const byKey = options.map((o, i) => [placeKey(o), i] as const).filter(([k]) => k === placeKey(want));
  if (byKey.length === 1) return byKey[0]![1];
  if (byKey.length > 1) return 'ambiguous';
  const contains = options.map((o, i) => [` ${nameKey(o)} `, i] as const).filter(([k]) => key && k.includes(` ${key} `));
  if (contains.length === 1) return contains[0]![1];
  if (contains.length > 1) return 'ambiguous';
  const degree = degreeKey(want);
  const sameDegree = degree ? options.map((o, i) => [degreeKey(o), i] as const).filter(([d]) => d === degree) : [];
  if (sameDegree.length === 1) return sameDegree[0]![1];
  if (sameDegree.length > 1) return 'ambiguous';
  // Some lists name only the level ("Masters", "Bachelor's Degree"): match a degree to its level as a last resort.
  const level = levelKey(want) ?? (degree ? DEGREE_LEVEL[degree] : undefined);
  const sameLevel = level ? options.map((o, i) => [levelKey(o), i] as const).filter(([l]) => l === level) : [];
  if (sameLevel.length === 1) return sameLevel[0]![1];
  return sameLevel.length > 1 ? 'ambiguous' : -1;
}

const ABBREVIATED = new Set(['aa', 'as', 'ba', 'bs', 'bfa', 'ma', 'ms', 'mfa', 'mba', 'phd', 'jd', 'md']);
const LEVEL: Record<string, string> = { associate: 'a', bachelor: 'b', master: 'm' };
const FIELD: Record<string, string> = { science: 's', arts: 'a', art: 'a', 'fine arts': 'fa' };

const DEGREE_LEVEL: Record<string, string> = { aa: 'associate', as: 'associate', ba: 'bachelor', bs: 'bachelor', bfa: 'bachelor', ma: 'master', ms: 'master', mfa: 'master', mba: 'master', phd: 'doctorate' };

/** A level-only degree name: "Masters", "Master's Degree", "Doctorate" → its level. Undefined for anything else. */
function levelKey(s: string): string | undefined {
  const k = nameKey(s);
  const m = k.match(/^(associate|bachelor|master)s?(?: s)?(?: degree)?$/);
  if (m) return m[1];
  return /^doctor(ate|al)?(?: degree)?$/.test(k) ? 'doctorate' : undefined;
}

/** "Masters of Science", "M.S.", "MS" and "Master of Science (M.S.)" → "ms". Undefined for anything that isn't a common degree. */
export function degreeKey(s: string): string | undefined {
  // "Name (abbreviation)": either part names the degree; if both do, they must agree.
  const tagged = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (tagged) {
    const [name, abbr] = [degreeKey(tagged[1]!), degreeKey(tagged[2]!)];
    return name && abbr && name !== abbr ? undefined : name ?? abbr;
  }
  const k = nameKey(s);
  const compact = k.replace(/ /g, '').replace(/^(b|m)sc$/, '$1s');
  if (ABBREVIATED.has(compact)) return compact;
  if (/^masters?( s)? (of |in )?business administration$/.test(k)) return 'mba';
  if (/^doctor (of )?philosophy$/.test(k)) return 'phd';
  if (/^juris doctor(ate)?$/.test(k)) return 'jd';
  if (/^doctor (of )?medicine$/.test(k)) return 'md';
  const m = k.match(/^(associate|bachelor|master)s? (?:s )?(?:of |in )?(science|fine arts|arts?)(?: in .+)?$/);
  return m ? LEVEL[m[1]!]! + FIELD[m[2]!]! : undefined;
}

const TAG = /\s*\([^()]*\)\s*$/;
/** "Asian (United States of America)" → "Asian": drops a trailing bracketed tag. */
export const untagged = (s: string) => s.replace(TAG, '');

/**
 * Sensitive answers: the one option equal to `want`, or equal to it plus a bracketed tag that 2+ options share
 * (a list-wide qualifier, never a one-off clarification like "Yes (I will require sponsorship)"). User decision 2026-10-11.
 * `want` may hold several wordings, one per line (employers word the same answer differently); they must all land on one option.
 */
export function exactChoice(options: readonly string[], want: string, key: (s: string) => string = norm): number | 'ambiguous' {
  const hits = new Set(want.split('\n').map((w) => exactOne(options, w, key)).filter((i) => i >= 0));
  return hits.size === 1 ? [...hits][0]! : hits.size > 1 ? 'ambiguous' : -1;
}

function exactOne(options: readonly string[], want: string, key: (s: string) => string): number {
  const w = key(want);
  if (!w) return -1;
  const exact = options.findIndex((o) => key(o) === w);
  if (exact >= 0) return exact;
  const tags = options.map((o) => o.match(TAG)?.[0].trim());
  const shared = (t: string | undefined) => !!t && tags.filter((x) => x === t).length >= 2;
  const hits = options.flatMap((o, i) => (shared(tags[i]) && key(untagged(o)) === w ? [i] : []));
  return hits.length === 1 ? hits[0]! : -1;
}

