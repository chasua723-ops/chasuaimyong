import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNum: number;
  content: string;
}

export async function extractPagesFromBuffer(buffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNum: page.num, content: page.text }));
  } finally {
    await parser.destroy();
  }
}
