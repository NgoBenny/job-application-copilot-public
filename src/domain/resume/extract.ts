import { z } from 'zod';
import { PartialDate, SafeUrl, text } from '../fields';

/**
 * The companion JSON a resume-tailoring chat produces next to the PDF.
 * Proposals only: never proof of a fact, never written to the master profile without approval.
 */
export const TailoredResumeJSON = z.strictObject({
  schemaVersion: z.literal(1),
  job: z.strictObject({ company: text(), title: text(), url: SafeUrl.default(''), description: text(20_000).default('') }),
  resume: z.strictObject({ filename: text(255) }),
  candidate: z.strictObject({ firstName: text(100), lastName: text(100), email: text(254).default(''), phone: text(40).default('') }),
  links: z.array(z.strictObject({ kind: z.enum(['linkedin', 'github', 'portfolio', 'other']).default('other'), url: SafeUrl })).max(20).default([]),
  // Entries drop fields they don't use (chats add "technologies", "gpa", …) instead of failing the whole import;
  // the fields kept are still validated, and dropped data never reaches the profile.
  education: z.array(z.object({
    masterRecordId: text(64).optional(),
    school: text(), degree: text().default(''), major: text().default(''),
    start: PartialDate.default(''), end: PartialDate.default(''),
  })).max(20).default([]),
  experience: z.array(z.object({
    masterRecordId: text(64).optional(),
    employer: text(), title: text(), location: text().default(''),
    start: PartialDate.default(''), end: PartialDate.default(''), current: z.boolean().default(false),
    bullets: z.array(text(1000)).max(50).default([]),
  })).max(50).default([]),
  projects: z.array(z.object({
    masterRecordId: text(64).optional(),
    name: text(), description: text(2000).default(''), bullets: z.array(text(1000)).max(50).default([]),
  })).max(50).default([]),
  // A plain name ("Python") is how tailoring chats usually write skills; it means a skill shown on the resume.
  // Chats also group them by category ({ "languages": [...], "tools": [...] }): the groups are merged into one list.
  skills: z.preprocess((v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v).flat() : v), z.array(z.union([
    text(100).min(1).transform((name) => ({ name, source: 'resume' as const, evidence: '' })),
    z.strictObject({ name: text(100).min(1), source: z.enum(['resume', 'job', 'both']).default('resume'), evidence: text(500).default('') }),
  ])).max(300).default([])),
});
export type TailoredResumeJSON = z.infer<typeof TailoredResumeJSON>;

/** Platform-neutral result of reading a tailored resume (PDF, JSON or both). Immutable once imported. */
export const ResumeExtract = z.strictObject({
  source: z.enum(['pdf', 'json', 'pdf+json']),
  resumeFilename: text(255),
  /** SHA-256 of the PDF bytes, when a PDF was read. */
  pdfFingerprint: z.string().max(64).default(''),
  candidate: z.strictObject({ name: text(), email: text(254), phone: text(40) }),
  links: z.array(SafeUrl).max(20),
  education: z.array(z.strictObject({ masterRecordId: text(64).optional(), school: text(), degree: text(), major: text(), start: PartialDate, end: PartialDate })).max(20),
  experience: z.array(z.strictObject({ masterRecordId: text(64).optional(), employer: text(), title: text(), start: PartialDate, end: PartialDate, current: z.boolean(), bullets: z.array(text(1000)).max(50) })).max(50),
  projects: z.array(z.strictObject({ name: text(), bullets: z.array(text(1000)).max(50) })).max(50),
  skills: z.array(z.strictObject({ name: text(100), evidence: text(500) })).max(300),
  job: z.strictObject({ company: text(), title: text(), url: SafeUrl, description: text(20_000) }),
  /** Honest notes about extraction quality and PDF/JSON disagreements. */
  warnings: z.array(text(300)).max(30),
});
export type ResumeExtract = z.infer<typeof ResumeExtract>;

export function fromTailoredJson(j: TailoredResumeJSON): ResumeExtract {
  return {
    source: 'json',
    resumeFilename: j.resume.filename,
    pdfFingerprint: '',
    candidate: { name: `${j.candidate.firstName} ${j.candidate.lastName}`.trim(), email: j.candidate.email, phone: j.candidate.phone },
    links: j.links.map((l) => l.url).filter(Boolean),
    education: j.education.map(({ masterRecordId, school, degree, major, start, end }) => ({ masterRecordId, school, degree, major, start, end })),
    experience: j.experience.map(({ masterRecordId, employer, title, start, end, current, bullets }) => ({ masterRecordId, employer, title, start, end, current, bullets })),
    projects: j.projects.map(({ name, bullets }) => ({ name, bullets })),
    // A skill the JSON says came only from the job description is relevance, not evidence.
    skills: j.skills.filter((s) => s.source !== 'job').map(({ name, evidence }) => ({ name, evidence })),
    job: { company: j.job.company, title: j.job.title, url: j.job.url, description: j.job.description },
    warnings: j.skills.some((s) => s.source === 'job') ? ['Skills marked as coming only from the job description were not imported as your skills.'] : [],
  };
}
