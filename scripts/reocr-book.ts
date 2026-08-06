import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { askClaudeVision } from '../src/lib/ai/client';

const OCR_SYSTEM_PROMPT =
  '당신은 정확한 OCR(광학 문자 인식) 엔진입니다. 이미지에 있는 모든 텍스트를 원문 그대로, 빠짐없이 전사하세요. ' +
  '설명, 주석, 요약을 절대 추가하지 마세요. 텍스트만 출력하세요. 페이지에 텍스트가 전혀 없으면 빈 문자열만 출력하세요.';

const OCR_USER_PROMPT = '이 이미지에 있는 모든 텍스트(한글, 한자, 중국어, 영어, 숫자 포함)를 정확하게 그대로 옮겨 적어주세요.';

export interface ReocrBookArgs {
  filePath: string;
  bookId: string;
  startPage?: number;
  endPage?: number;
  concurrency?: number;
}

export interface PageFailure {
  pageNum: number;
  error: string;
}

function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}

/**
 * Processes one page: vision-OCR it, then write the result. Retries once on
 * failure (content-filter trips and transient API errors are sometimes
 * non-deterministic) before giving up on this page.
 */
async function processPage(
  shot: { pageNumber: number; dataUrl: string },
  args: ReocrBookArgs,
  supabase: SupabaseClient,
  aiClient: Anthropic
): Promise<string> {
  const base64 = dataUrlToBase64(shot.dataUrl);
  const text = await askClaudeVision(aiClient, base64, 'image/png', OCR_USER_PROMPT, {
    system: OCR_SYSTEM_PROMPT,
    maxTokens: 2048,
  });

  const { error } = await supabase
    .from('book_pages')
    .update({ content: text })
    .eq('book_id', args.bookId)
    .eq('page_num', shot.pageNumber);
  if (error) {
    throw new Error(`Failed to update page ${shot.pageNumber}: ${error.message}`);
  }

  return text;
}

export async function reocrBook(
  args: ReocrBookArgs,
  supabase: SupabaseClient,
  aiClient: Anthropic,
  onProgress?: (pageNum: number, totalPages: number, charCount: number) => void,
  onError?: (pageNum: number, error: Error) => void
): Promise<{ pagesProcessed: number; failures: PageFailure[] }> {
  const buffer = await readFile(args.filePath);
  const parser = new PDFParse({ data: buffer });
  let pagesProcessed = 0;
  const failures: PageFailure[] = [];

  try {
    const info = await parser.getInfo();
    const totalPages = info.total;
    const start = args.startPage ?? 1;
    const end = args.endPage ?? totalPages;
    const concurrency = args.concurrency ?? 5;

    const pageNums: number[] = [];
    for (let p = start; p <= end; p++) pageNums.push(p);

    for (let i = 0; i < pageNums.length; i += concurrency) {
      const batch = pageNums.slice(i, i + concurrency);

      const screenshots = await parser.getScreenshot({
        partial: batch,
        imageDataUrl: true,
        imageBuffer: false,
        desiredWidth: 1600,
      });

      await Promise.all(
        screenshots.pages.map(async (shot) => {
          try {
            let text: string;
            try {
              text = await processPage(shot, args, supabase, aiClient);
            } catch {
              // one retry — content-filter trips and transient API errors
              // are sometimes non-deterministic
              text = await processPage(shot, args, supabase, aiClient);
            }
            pagesProcessed++;
            onProgress?.(shot.pageNumber, totalPages, text.length);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            failures.push({ pageNum: shot.pageNumber, error: error.message });
            onError?.(shot.pageNumber, error);
          }
        })
      );
    }
  } finally {
    await parser.destroy();
  }

  return { pagesProcessed, failures };
}
