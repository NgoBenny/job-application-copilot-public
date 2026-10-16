import type { Education, Employment, MasterProfile } from '../schemas';
import { nameKey, sameName } from '../text';
import type { ResumeExtract } from './extract';

/**
 * Combine a PDF read with its companion JSON. JSON supplies structure; the PDF is the document the
 * employer will actually see, so disagreements become warnings instead of silent picks.
 */
export function combine(pdf: ResumeExtract, json: ResumeExtract): ResumeExtract {
  const warnings = [...json.warnings, ...pdf.warnings.slice(1)];
  if (json.resumeFilename && pdf.resumeFilename && json.resumeFilename.toLowerCase() !== pdf.resumeFilename.toLowerCase()) {
    warnings.push(`The JSON names "${json.resumeFilename}" but the PDF is "${pdf.resumeFilename}". They may be for different jobs.`);
  }
  if (pdf.candidate.name && json.candidate.name && nameKey(pdf.candidate.name) !== nameKey(json.candidate.name)) {
    warnings.push('The candidate name in the JSON does not match the PDF.');
  }
  const missing = json.experience.filter((j) => !pdf.experience.some((p) => sameName(p.employer, j.employer) || sameName(p.title, j.title)));
  if (missing.length) warnings.push(`${missing.length} job(s) in the JSON were not found in the PDF text.`);
  return { ...json, source: 'pdf+json', pdfFingerprint: pdf.pdfFingerprint, links: json.links.length ? json.links : pdf.links, warnings };
}

export type FieldDiff = { field: string; resume: string; master: string };
export type RecordMatch<M> = { index: number; label: string; master?: M; diffs: FieldDiff[] };

const diff = (pairs: [string, string, string][]): FieldDiff[] =>
  pairs.filter(([, r, m]) => r !== '' && nameKey(r) !== nameKey(m)).map(([field, resume, master]) => ({ field, resume, master }));

/** Match imported records to master records by identity (explicit id, then name), never by position. */
export function reconcile(extract: ResumeExtract, profile: MasterProfile) {
  const education: RecordMatch<Education>[] = extract.education.map((e, index) => {
    const candidates = profile.education.filter((m) => sameName(m.school, e.school));
    // Several degrees at one school: the degree must also match, otherwise it's ambiguous and left unmatched.
    const master = profile.education.find((m) => m.id === e.masterRecordId) ?? (candidates.length === 1 ? candidates[0] : candidates.find((m) => nameKey(m.degree) === nameKey(e.degree)));
    return {
      index, label: e.school || 'Untitled school', master,
      diffs: master ? diff([['Degree', e.degree, master.degree], ['Major', e.major, master.major], ['Start', e.start, master.start], ['End', e.end, master.end]]) : [],
    };
  });
  const employment: RecordMatch<Employment>[] = extract.experience.map((e, index) => {
    const byId = profile.employment.find((m) => m.id === e.masterRecordId);
    const candidates = profile.employment.filter((m) => sameName(m.employer, e.employer));
    // Several jobs at one employer: the title must also match, otherwise it's ambiguous and left unmatched.
    const master = byId ?? (candidates.length === 1 ? candidates[0] : candidates.find((m) => sameName(m.title, e.title)));
    return {
      index, label: [e.title, e.employer].filter(Boolean).join(' at ') || 'Untitled job', master,
      diffs: master ? diff([['Title', e.title, master.title], ['Start', e.start, master.start], ['End', e.current ? 'Present' : e.end, master.current ? 'Present' : master.end]]) : [],
    };
  });
  const known = new Set(profile.skills.map((s) => nameKey(s.name)));
  const unverifiedSkills = extract.skills.filter((s) => !known.has(nameKey(s.name))).map((s) => s.name);
  return { education, employment, unverifiedSkills };
}
