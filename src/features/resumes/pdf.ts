// Local PDF text extraction. The worker is bundled with the extension (no remote code, CSP-safe).
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Parsed } from '../../domain/backup';

GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_LIMITS = { bytes: 10_000_000, pages: 10, ms: 15_000 };

type Item = { str: string; transform: number[]; width: number; hasEOL?: boolean };

/** Rebuilds visual lines from positioned text; wide gaps become 3 spaces (read as column separators). */
export function itemsToLines(items: Item[]): string[] {
  const rows: { y: number; items: Item[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5]!;
    const row = rows.find((r) => Math.abs(r.y - y) < 2);
    if (row) row.items.push(it); else rows.push({ y, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      const sorted = r.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
      let line = '', end = -Infinity;
      for (const it of sorted) {
        const x = it.transform[4]!, size = Math.abs(it.transform[0]!) || 10;
        if (line) line += x - end > size * 1.5 ? '   ' : x - end > size * 0.15 ? ' ' : '';
        line += it.str;
        end = x + it.width;
      }
      return line;
    });
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readPdf(file: File): Promise<Parsed<{ lines: string[]; fingerprint: string }>> {
  if (file.size > PDF_LIMITS.bytes) return { ok: false, error: `This PDF is larger than ${PDF_LIMITS.bytes / 1_000_000} MB.` };
  const bytes = await file.arrayBuffer();
  const fingerprint = await sha256(bytes);
  const task = getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, enableXfa: false });
  const timer = setTimeout(() => void task.destroy(), PDF_LIMITS.ms);
  try {
    const doc = await task.promise;
    if (doc.numPages > PDF_LIMITS.pages) return { ok: false, error: `This PDF has ${doc.numPages} pages; resumes over ${PDF_LIMITS.pages} pages aren't read.` };
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      lines.push(...itemsToLines(content.items.filter((i) => 'str' in i) as Item[]));
    }
    if (lines.join('').replace(/\s/g, '').length < 20) {
      return { ok: false, error: 'No text was found in this PDF. It may be a scanned image. Import the companion JSON or enter details by hand.' };
    }
    return { ok: true, value: { lines, fingerprint } };
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'PasswordException') return { ok: false, error: 'This PDF is password-protected. Save an unprotected copy and try again.' };
    if (name === 'InvalidPDFException' || name === 'FormatError') return { ok: false, error: 'This file is not a readable PDF.' };
    if (task.destroyed) return { ok: false, error: `Reading the PDF took longer than ${PDF_LIMITS.ms / 1000} seconds and was stopped.` };
    return { ok: false, error: 'The PDF could not be read.' };
  } finally {
    clearTimeout(timer);
    void task.destroy();
  }
}
