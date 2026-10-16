import { parseUntrustedJson, type Parsed } from '../../domain/backup';
import { fromTailoredJson, TailoredResumeJSON, type ResumeExtract } from '../../domain/resume/extract';
import { readResumeLines } from '../../domain/resume/pdf-text';
import { combine } from '../../domain/resume/reconcile';
import { readPdf } from '../resumes/pdf';

const MAX_JSON_BYTES = 500_000;

async function readJson(file: File): Promise<Parsed<ResumeExtract>> {
  if (file.size > MAX_JSON_BYTES) return { ok: false, error: `File is larger than ${MAX_JSON_BYTES / 1000} KB.` };
  const json = parseUntrustedJson(await file.text(), MAX_JSON_BYTES);
  if (!json.ok) return json;
  const r = TailoredResumeJSON.safeParse(json.value);
  if (!r.success) return { ok: false, error: `The JSON doesn't match the tailored-resume format (${r.error.issues.slice(0, 2).map((i) => i.path.join('.') || 'root').join(', ')}).` };
  return { ok: true, value: fromTailoredJson(r.data) };
}

/** PDF only, JSON only, or both. Errors from each file are reported separately and nothing is half-imported. */
export async function importResume(pdf?: File, json?: File): Promise<Parsed<ResumeExtract>> {
  if (!pdf && !json) return { ok: false, error: 'Choose a PDF, a JSON file, or both.' };
  const [p, j] = await Promise.all([
    pdf ? readPdf(pdf).then((r) => (r.ok ? { ok: true as const, value: readResumeLines(r.value.lines, pdf.name, r.value.fingerprint) } : r)) : undefined,
    json ? readJson(json) : undefined,
  ]);
  if (p && !p.ok) return { ok: false, error: `PDF: ${p.error}` };
  if (j && !j.ok) return { ok: false, error: `JSON: ${j.error}` };
  if (p && j) return { ok: true, value: combine(p.value, j.value) };
  return (p ?? j)!;
}
