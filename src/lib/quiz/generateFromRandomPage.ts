import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { generateQuestions, type GeneratedQuestion } from '../ai/generateQuestions';

export interface GenerateFromRandomPageInput {
  bookId: string;
  bookName: string;
  maxPage: number;
  type: QuestionType;
}

export interface RandomPageGenerationResult extends GeneratedQuestion {
  usedReference: boolean;
}

function randomPage(maxPage: number): number {
  return Math.floor(Math.random() * maxPage) + 1;
}

/**
 * Picks a random page in [1, maxPage] and generates one question of `type` grounded in it.
 * A random page can land on front matter (title page, copyright, ISBN info) with no
 * teachable content — Claude then declines with prose instead of the requested JSON, which
 * generateQuestions surfaces as a thrown error. Retries with a fresh page (bounded attempts)
 * rather than failing on one unlucky draw, covering both a missing book_pages row and a
 * generateQuestions rejection.
 */
export async function generateFromRandomPage(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateFromRandomPageInput
): Promise<RandomPageGenerationResult> {
  let referenceExcerpts: string[] | undefined;
  if (input.type === 'reading') {
    const { data: refs } = await (supabase.from('reference_materials') as any)
      .select('content')
      .ilike('name', '%독해%')
      .limit(2);
    referenceExcerpts = (refs ?? []).map((r: any) => r.content);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const pageNum = randomPage(input.maxPage);
    const { data: page } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .eq('page_num', pageNum)
      .maybeSingle();
    if (!page) continue;

    try {
      const [generated] = await generateQuestions(aiClient, {
        bookName: input.bookName,
        pages: [{ pageNum: page.page_num, content: page.content }],
        types: [input.type],
        referenceExcerpts,
      });
      // Trust the page we actually fed in, not Claude's self-reported sourcePage — we know
      // definitively which page this question came from since exactly one was provided.
      return { ...generated, sourcePage: page.page_num, usedReference: !!referenceExcerpts?.length };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No page content found for question generation');
}
