// Skill ranking and matching. Verified inventory is the only source of skills;
// the tailored resume adds evidence, the job description adds relevance only.

/** Bump when ALIAS_GROUPS changes meaning. */
export const ALIAS_VERSION = 1;

// Each group names one concept. Deliberately absent: Java≠JavaScript, C≠C++≠C#, React≠React Native.
const ALIAS_GROUPS: string[][] = [
  ['JavaScript', 'JS', 'ECMAScript'], ['TypeScript', 'TS'], ['React', 'React.js', 'ReactJS'], ['Node.js', 'NodeJS'],
  ['Vue.js', 'Vue', 'VueJS'], ['Next.js', 'NextJS'], ['PostgreSQL', 'Postgres'], ['Microsoft SQL Server', 'MSSQL', 'SQL Server'],
  ['scikit-learn', 'Scikit Learn', 'sklearn'], ['Amazon Web Services', 'AWS'], ['Google Cloud Platform', 'GCP', 'Google Cloud'], ['Microsoft Azure', 'Azure'],
  ['Kubernetes', 'K8s'], ['Machine Learning', 'ML'], ['Artificial Intelligence', 'AI'], ['C#', 'C Sharp'], ['C++', 'CPP'], ['Go', 'Golang'],
  ['Microsoft Excel', 'Excel'], ['Microsoft PowerPoint', 'PowerPoint'], ['Continuous Integration', 'CI/CD', 'CI'], ['Objective-C', 'ObjC'], ['GraphQL'], ['TensorFlow'], ['PyTorch'],
];

/** Case/space/hyphen-insensitive, but keeps symbols that change meaning (C++, C#, .NET). */
export function skillKey(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '').replace(/\.$/, '');
}

const GROUP_OF = new Map<string, string[]>();
for (const g of ALIAS_GROUPS) for (const n of g) GROUP_OF.set(skillKey(n), g);

export interface UserAlias { skill: string; option: string }

/** Spellings to try in order: the name itself, then built-in aliases, then aliases the user approved. Deduplicated. */
export function spellings(name: string, userAliases: readonly UserAlias[] = []): string[] {
  const out = [name, ...(GROUP_OF.get(skillKey(name)) ?? []), ...userAliases.filter((a) => skillKey(a.skill) === skillKey(name)).map((a) => a.option)];
  const seen = new Set<string>();
  return out.filter((s) => !seen.has(skillKey(s)) && seen.add(skillKey(s)));
}

export const sameSkill = (a: string, b: string, userAliases: readonly UserAlias[] = []) => spellings(a, userAliases).some((s) => skillKey(s) === skillKey(b));

/** Whole-word mention; names of 1–2 characters ("Go", "R", "C") must match case exactly to avoid ordinary words. */
export function mentions(text: string, name: string): boolean {
  return spellings(name).some((s) => {
    const re = new RegExp(`(^|[^A-Za-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9+#])`, s.length <= 2 ? '' : 'i');
    return re.test(text);
  });
}

export interface RankedSkill {
  name: string;
  /** Where the evidence comes from. "job description" alone never makes a skill eligible. */
  sources: ('verified' | 'tailored resume' | 'job description')[];
  score: number;
  /** Pre-ticked: verified and on the tailored resume. */
  suggested: boolean;
}

export function rankSkills(verified: readonly string[], resumeSkills: readonly string[], jobDescription = ''): { ranked: RankedSkill[]; unverified: string[] } {
  const ranked = verified.map((name) => {
    const inResume = resumeSkills.some((r) => sameSkill(name, r));
    const inJd = jobDescription ? mentions(jobDescription, name) : false;
    const sources: RankedSkill['sources'] = ['verified', ...(inResume ? ['tailored resume' as const] : []), ...(inJd ? ['job description' as const] : [])];
    return { name, sources, score: (inResume ? 2 : 0) + (inJd ? 1 : 0), suggested: inResume };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const unverified = resumeSkills.filter((r) => !verified.some((v) => sameSkill(v, r)));
  return { ranked, unverified };
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.-]+/).map((t) => t.replace(/\.$/, '')).filter(Boolean);

/** An option relates to a search when it contains every searched word as a whole word ("Python" → "Python (Programming Language)", never "Java" → "JavaScript"). */
export function relatedSkill(option: string, searched: string): boolean {
  const have = new Set(tokens(option));
  const want = tokens(searched);
  return want.length > 0 && want.every((t) => have.has(t));
}

export type SkillDecision = { pick: number } | { suggestions: string[] } | { none: true };

/**
 * Given the options a search returned, pick only an exact match for the spelling searched.
 * Anything else that mentions it is a "broader suggestion" for the user to approve; nothing is picked on its own.
 */
export function decideSkill(options: readonly string[], spelling: string): SkillDecision {
  const exact = options.findIndex((o) => skillKey(o) === skillKey(spelling));
  if (exact >= 0) return { pick: exact };
  const related = options.filter((o) => relatedSkill(o, spelling));
  return related.length ? { suggestions: related.slice(0, 5) } : { none: true };
}
