// Regenerates tests/fixtures/pdf/*.pdf from fabricated text. Run: node scripts/make-fixture-pdfs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { RESUME_LINES } from '../tests/fixtures/data/resume-text.ts';

const out = 'tests/fixtures/pdf';
mkdirSync(out, { recursive: true });

async function resume(lines: string[]) {
  const doc = await PDFDocument.create();
  doc.setTitle('Fabricated resume');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  let y = 750;
  for (const line of lines) {
    // Columns separated by 3+ spaces are drawn apart, like a real two-column header.
    line.split(/\s{3,}/).forEach((part, i) => page.drawText(part.replace(/[•–—]/g, (c) => ({ '•': '-', '–': '-', '—': '-' })[c]!), { x: 50 + i * 320, y, size: 10, font }));
    y -= 16;
  }
  return doc.save();
}

async function imageOnly() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawRectangle({ x: 50, y: 600, width: 400, height: 120, color: rgb(0.8, 0.8, 0.8) });
  return doc.save();
}

/** A minimal PDF whose /Encrypt dictionary rejects the empty user password, so readers must ask for one. */
function encrypted() {
  const hex = (n: number, seed: number) => Array.from({ length: n }, (_, i) => ((i * 37 + seed) % 256).toString(16).padStart(2, '0')).join('');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${hex(32, 1)}> /U <${hex(32, 2)}> /P -44 >>`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 4 0 R /ID [<${hex(16, 3)}> <${hex(16, 3)}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

writeFileSync(`${out}/avery-acme-swe.pdf`, await resume(RESUME_LINES));
writeFileSync(`${out}/image-only.pdf`, await imageOnly());
writeFileSync(`${out}/encrypted.pdf`, encrypted());
writeFileSync(`${out}/corrupt.pdf`, '%PDF-1.7\nthis is not really a pdf\n');
console.log(`Wrote fixture PDFs to ${out}`);
