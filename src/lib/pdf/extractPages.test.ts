import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPagesFromBuffer } from './extractPages';

async function buildSamplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const page1 = doc.addPage([300, 300]);
  page1.drawText('Page one content', { x: 20, y: 250, size: 14, font });

  const page2 = doc.addPage([300, 300]);
  page2.drawText('Page two content', { x: 20, y: 250, size: 14, font });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('extractPagesFromBuffer', () => {
  it('extracts text per page with 1-indexed page numbers', async () => {
    const buffer = await buildSamplePdf();
    const pages = await extractPagesFromBuffer(buffer);

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNum).toBe(1);
    expect(pages[0].content).toContain('Page one content');
    expect(pages[1].pageNum).toBe(2);
    expect(pages[1].content).toContain('Page two content');
  });
});
