import { z } from 'zod';
import { id, PartialDate, SafeUrl, text } from './fields';
import { ResumeExtract } from './resume/extract';

export { PartialDate, SafeUrl } from './fields';

export const Link = z.strictObject({
  id,
  kind: z.enum(['linkedin', 'github', 'portfolio', 'other']),
  label: text(80),
  url: SafeUrl,
});

export const Education = z.strictObject({
  id,
  school: text(),
  degree: text(),
  major: text(),
  start: PartialDate,
  end: PartialDate,
  status: z.enum(['', 'completed', 'in progress', 'expected']),
  gpa: text(20).default(''), // absent in older stores and backups
});

export const Employment = z.strictObject({
  id,
  employer: text(),
  title: text(),
  location: text(),
  start: PartialDate,
  end: PartialDate,
  current: z.boolean(),
  bullets: z.array(text(1000)).max(50),
});

export const Project = z.strictObject({
  id,
  name: text(),
  url: SafeUrl,
  description: text(2000),
  bullets: z.array(text(1000)).max(50),
});

export const Skill = z.strictObject({ id, name: text(100).min(1) });

export const Contact = z.strictObject({
  firstName: text(100),
  lastName: text(100),
  preferredName: text(100),
  email: z.union([z.literal(''), z.email().max(254)]),
  phone: text(40),
  addressLine1: text(),
  city: text(100),
  region: text(100),
  postalCode: text(20),
  country: text(100),
});

export const MasterProfile = z.strictObject({
  contact: Contact,
  links: z.array(Link).max(20),
  education: z.array(Education).max(20),
  employment: z.array(Employment).max(50),
  projects: z.array(Project).max(50),
  skills: z.array(Skill).max(300),
});

/** One job application: employer/job scope, its own tailored resume and selections. Never changes the master profile. */
export const Application = z.strictObject({
  id,
  platformId: z.enum(['workday', 'greenhouse']), // a new application starts as workday; activation records the real one
  employerLabel: text(),
  jobTitle: text(),
  jobUrl: SafeUrl,
  /** Set when the application is bound to a portal tab (Phase 3). */
  portalOrigin: z.string().max(300),
  tenantKey: z.string().max(300),
  jobDescription: text(20_000),
  /** Off by default: the job description is kept only while the page is open. */
  persistJobDescription: z.boolean(),
  resumeImportMethod: z.enum(['none', 'pdf', 'json', 'pdf+json']),
  /** Immutable snapshot of what was imported. */
  imported: ResumeExtract.optional(),
  reviewed: z.boolean(),
  /** Skills the user approved and the site accepted for this application. */
  skillSelections: z.array(text(100)).max(300),
  /** Set only when the user confirms the application was submitted. */
  submittedAt: z.union([z.literal(''), z.iso.datetime()]),
  /** Step names seen while scanning (labels only, never answers). */
  stepsSeen: z.array(z.strictObject({ label: text(200), at: z.iso.datetime() })).max(50),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A user-approved mapping from one of their skills to the option text a site uses for it. */
export const SkillAlias = z.strictObject({ skill: text(100).min(1), option: text(200).min(1) });
/** A site option the user chose for a profile value in a search box (Field of Study "Computer Science" → "Computer and Information Science"). */
export const OptionAlias = z.strictObject({ field: text(60).min(1), value: text(300).min(1), option: text(300).min(1) });
export type OptionAlias = z.infer<typeof OptionAlias>;

/** An answer the user explicitly confirmed with "Remember". Never created from page values on its own. */
export const QuestionMemorySchema = z.strictObject({
  id,
  question: text(3000).min(1), // stored whole: matching uses the exact wording; some questions carry long definitions
  kind: z.enum(['choice', 'text']),
  answer: text(5000).min(1),
  options: z.array(text(300)).max(300), // checkbox lists run long (live Greenhouse board 2 2026-10-12: ~80 disciplines)
  scope: z.enum(['global', 'employer', 'job']),
  tenantKey: z.string().max(300),
  applicationId: z.string().max(64),
  confirmedAt: z.iso.datetime(),
});

/** Sensitive answers the user typed in the dashboard (user decision 2026-10-10). */
export const SensitiveAnswerSchema = z.strictObject({
  topic: z.enum(['gender', 'race', 'hispanic', 'veteran', 'disability', 'authorizedToWork', 'sponsorship', 'conviction', 'over18']),
  answer: text(1000).min(1), // several wordings, one per line
});

/** One employer portal account. No passwords, cookies, tokens or codes exist anywhere in this record. */
export const AccountRecord = z.strictObject({
  id,
  tenantKey: z.string().min(1).max(300),
  employerLabel: text(),
  email: z.union([z.literal(''), z.email().max(254)]),
  /** Changes only when the user says so. */
  status: z.enum(['unknown', 'registered', 'verificationPending']),
  updatedAt: z.iso.datetime(),
});

export const SCHEMA_VERSION = 5;

export const Store = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Bumped on every write; a save with an old revision is rejected so two tabs can't clobber each other. */
  revision: z.number().int().nonnegative(),
  profile: MasterProfile,
  applications: z.array(Application).max(500),
  skillAliases: z.array(SkillAlias).max(500),
  optionAliases: z.array(OptionAlias).max(500).default([]), // absent in older stores and backups
  answers: z.array(QuestionMemorySchema).max(1000),
  sensitiveAnswers: z.array(SensitiveAnswerSchema).max(20),
  accounts: z.array(AccountRecord).max(500),
});

export type PartialDate = z.infer<typeof PartialDate>;
export type Link = z.infer<typeof Link>;
export type Education = z.infer<typeof Education>;
export type Employment = z.infer<typeof Employment>;
export type Project = z.infer<typeof Project>;
export type Skill = z.infer<typeof Skill>;
export type Contact = z.infer<typeof Contact>;
export type MasterProfile = z.infer<typeof MasterProfile>;
export type Application = z.infer<typeof Application>;
export type AccountRecord = z.infer<typeof AccountRecord>;
export type Store = z.infer<typeof Store>;

/** Retention rule enforced on every write: job descriptions are stored only on opt-in. */
export function applyRetention(store: Store): Store {
  return {
    ...store,
    applications: store.applications.map((a) => a.persistJobDescription ? a : {
      ...a, jobDescription: '', imported: a.imported && { ...a.imported, job: { ...a.imported.job, description: '' } },
    }),
  };
}

export const emptyStore = (): Store => ({
  schemaVersion: SCHEMA_VERSION,
  revision: 0,
  profile: {
    contact: { firstName: '', lastName: '', preferredName: '', email: '', phone: '', addressLine1: '', city: '', region: '', postalCode: '', country: '' },
    links: [],
    education: [],
    employment: [],
    projects: [],
    skills: [],
  },
  applications: [],
  skillAliases: [],
  optionAliases: [],
  answers: [],
  sensitiveAnswers: [],
  accounts: [],
});
