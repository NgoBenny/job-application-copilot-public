// Heuristic reader for resume text lines (already extracted from a PDF).
// shortcut: English section headings and common one-column layouts only; extend from real QA samples.
import { findDateRange, stripDates } from '../dates';
import type { ResumeExtract } from './extract';

type Section = 'header' | 'education' | 'experience' | 'projects' | 'skills' | 'other';

const HEADINGS: [RegExp, Section][] = [
  [/^(education|academic background)$/, 'education'],
  [/^((work|professional|relevant|industry)\s+)?(experience|employment|work history)$/, 'experience'],
  [/^((personal|selected|academic|technical)\s+)?projects$/, 'projects'],
  [/^((technical|core|key)\s+)?skills(\s*(and|&)\s*\w+)?$|^technologies$/, 'skills'],
  [/^(summary|profile|objective|awards|honors|certifications|leadership|activities|volunteering|publications|interests|coursework|relevant coursework)$/, 'other'],
];
const BULLET = /^[•●▪◦‣∙*–-]\s*/;
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic)\b/i;
const DEGREE = /\b(bachelor|master|associate|doctor|ph\.?\s?d|mba|b\.?\s?s|b\.?\s?a|m\.?\s?s|m\.?\s?a|b\.?\s?eng|m\.?\s?eng)\b\.?/i;
const TITLE = /\b(engineer|intern|developer|analyst|manager|assistant|scientist|designer|lead|consultant|specialist|associate|researcher|coordinator|architect|technician|administrator|director|officer|fellow|tutor|teaching)\b/i;
const LOCATION = /^([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*,\s?[A-Z]{2}|remote|hybrid)$/i;
const SEPARATORS = /\s+[|–—·]\s+|\s+-\s+|,\s+|\s+at\s+/;

function headingOf(line: string): Section | undefined {
  const t = line.replace(/:$/, '').trim().toLowerCase();
  if (t.length > 40) return undefined;
  return HEADINGS.find(([re]) => re.test(t))?.[1];
}

const parts = (s: string) => s.split(SEPARATORS).map((p) => p.trim()).filter((p) => p && !LOCATION.test(p));

export function readResumeLines(rawLines: string[], resumeFilename: string, pdfFingerprint = ''): ResumeExtract {
  // Wide gaps (columns in the PDF) become explicit separators before whitespace is collapsed.
  const lines = rawLines.map((l) => l.trim().replace(/\s{3,}/g, ' | ').replace(/\s+/g, ' ')).filter(Boolean);
  const sections: Record<Section, string[]> = { header: [], education: [], experience: [], projects: [], skills: [], other: [] };
  let current: Section = 'header';
  let headingsFound = 0;
  for (const line of lines) {
    const h = headingOf(line);
    if (h) { current = h; headingsFound++; } else sections[current].push(line);
  }

  const all = lines.join('\n');
  const email = all.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? '';
  const phone = sections.header.join(' ').match(/\+?\(?\d[\d\s().-]{5,}\d/)?.[0]?.trim() ?? '';
  const links = [...all.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|[\w-]+\.(?:dev|io|me))\/?[\w\-./]*/gi)]
    .map((m) => (m[0].startsWith('http') ? m[0] : `https://${m[0]}`).replace(/[.,]$/, ''));
  const first = sections.header[0] ?? '';
  const name = /^[A-Za-z][A-Za-z'.-]*(\s[A-Za-z][A-Za-z'.-]*){1,3}$/.test(first) ? first : '';

  const warnings = ['Read from PDF text using layout heuristics. Check every record before using it.'];
  if (all.length < 200) warnings.push('Very little text was found. This may be a scanned or image-only PDF.');
  if (headingsFound === 0) warnings.push('No standard section headings were found.');

  return {
    source: 'pdf',
    resumeFilename,
    pdfFingerprint,
    candidate: { name, email, phone },
    links: [...new Set(links)].slice(0, 20),
    education: readEducation(sections.education),
    experience: readExperience(sections.experience),
    projects: readProjects(sections.projects),
    skills: readSkills(sections.skills),
    job: { company: '', title: '', url: '', description: '' },
    warnings,
  };
}

function readEducation(lines: string[]): ResumeExtract['education'] {
  const out: ResumeExtract['education'] = [];
  for (const line of lines) {
    const range = findDateRange(line);
    const rest = stripDates(line);
    if (SCHOOL.test(rest) && !DEGREE.test(rest.split(/[,|–—]/)[0]!)) {
      out.push({ school: parts(rest)[0] ?? rest, degree: '', major: '', start: range?.start ?? '', end: range?.end ?? '' });
      continue;
    }
    const rec = out.at(-1);
    if (!rec) continue;
    if (!rec.degree && DEGREE.test(rest)) {
      const [degree, major = ''] = rest.split(/\s+in\s+|,\s+|\s+[|–—]\s+/);
      rec.degree = degree!.trim();
      rec.major = major.trim();
    }
    if (range && !rec.end) Object.assign(rec, { start: rec.start || range.start, end: range.end });
  }
  return out;
}

function readExperience(lines: string[]): ResumeExtract['experience'] {
  type Rec = ResumeExtract['experience'][number] & { head: string[] };
  const out: Rec[] = [];
  let pending: string[] = [];
  for (const line of lines) {
    const isBullet = BULLET.test(line);
    const range = !isBullet ? findDateRange(line) : undefined;
    const rec = out.at(-1);
    if (range) {
      // A date line starts a new job unless the current one has no bullets yet and no dates (two-line header).
      if (rec && rec.bullets.length === 0 && !rec.start && !rec.end) Object.assign(rec, range, { head: [...rec.head, ...pending, line] });
      else out.push({ employer: '', title: '', bullets: [], ...range, head: [...pending, line] });
      pending = [];
    } else if (isBullet) {
      if (rec) rec.bullets.push(line.replace(BULLET, ''));
      pending = [];
    } else if (rec && rec.bullets.length > 0 && /^[a-z(]/.test(line)) {
      rec.bullets[rec.bullets.length - 1] += ` ${line}`; // wrapped bullet
    } else if (rec && rec.bullets.length === 0) {
      rec.head.push(line);
    } else {
      pending.push(line);
    }
  }
  return out.map(({ head, ...rec }) => {
    const ps = head.flatMap((h) => parts(stripDates(h)));
    const title = ps.find((p) => TITLE.test(p)) ?? '';
    const employer = ps.find((p) => p !== title) ?? '';
    return { ...rec, title, employer };
  });
}

function readProjects(lines: string[]): ResumeExtract['projects'] {
  const out: ResumeExtract['projects'] = [];
  for (const line of lines) {
    if (BULLET.test(line)) out.at(-1)?.bullets.push(line.replace(BULLET, ''));
    else if (out.at(-1)?.bullets.length && /^[a-z(]/.test(line)) out.at(-1)!.bullets[out.at(-1)!.bullets.length - 1] += ` ${line}`;
    else out.push({ name: parts(stripDates(line))[0] ?? line, bullets: [] });
  }
  return out;
}

function readSkills(lines: string[]): ResumeExtract['skills'] {
  const names = lines.flatMap((l) => l.replace(/^[^:]{1,40}:\s*/, '').replace(BULLET, '').split(/\s*[,;•|·]\s*/));
  const seen = new Set<string>();
  return names
    .map((n) => n.replace(/\.$/, '').trim())
    .filter((n) => n.length > 0 && n.length <= 50 && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .map((name) => ({ name, evidence: 'PDF skills section' }));
}
