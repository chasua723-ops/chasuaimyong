import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { generateQuestions, type GeneratedQuestion } from '../ai/generateQuestions';
import { validateQuestion } from '../ai/validateQuestion';

export interface GenerateFromRandomPageInput {
  bookId: string;
  bookName: string;
  minPage?: number;
  maxPage: number;
  type: QuestionType;
}

export interface RandomPageGenerationResult extends GeneratedQuestion {
  usedReference: boolean;
}

const MAX_ATTEMPTS = 6;

function randomPage(minPage: number, maxPage: number): number {
  return Math.floor(Math.random() * (maxPage - minPage + 1)) + minPage;
}

/** Draws a page not yet in `tried`, unless every page in [minPage, maxPage] has already been tried. */
function randomUntriedPage(minPage: number, maxPage: number, tried: Set<number>): number {
  const rangeSize = maxPage - minPage + 1;
  let pageNum = randomPage(minPage, maxPage);
  while (tried.has(pageNum) && tried.size < rangeSize) {
    pageNum = randomPage(minPage, maxPage);
  }
  return pageNum;
}

/** Structural + AI review gate shared by the single-page loop and the whole-range fallback. */
async function reviewGeneratedQuestion(
  aiClient: Anthropic,
  pageContent: string,
  generated: GeneratedQuestion
): Promise<{ ok: true } | { ok: false; error: Error }> {
  if (generated.choices?.length && !generated.choices.includes(generated.correctAnswer)) {
    return { ok: false, error: new Error("Generated question's correctAnswer is not among its own choices") };
  }
  const validation = await validateQuestion(aiClient, { pageContent, question: generated });
  if (!validation.valid) {
    return { ok: false, error: new Error(`Generated question failed validation: ${validation.reason}`) };
  }
  return { ok: true };
}

/**
 * Picks a random page in [1, maxPage] and generates one question of `type` grounded in it.
 * A random page can land on front matter (title page, copyright, ISBN info) with no
 * teachable content, or on real prose that still isn't the right subject matter (e.g. a
 * preface, for a grammar question) — either way Claude declines with prose instead of the
 * requested JSON, which generateQuestions surfaces as a thrown error. A page like a table of
 * contents can instead produce a technically well-formed but useless question (e.g. asking
 * about the ToC's own layout), which doesn't throw on its own — so every generated question
 * is also checked structurally (its correctAnswer must be one of its own choices) and
 * reviewed by validateQuestion before being accepted.
 *
 * Early in a book, [1, maxPage] can be dominated by non-content front matter (cover, ToC,
 * preface) with real instructional content not yet reached — MAX_ATTEMPTS single-page draws
 * (each from a page not already tried) can still all miss. As a last resort, one fallback
 * attempt gives Claude the entire [1, maxPage] range as combined context instead of a single
 * page, so it can pick whichever page actually has usable content for `type`.
 */
export async function generateFromRandomPage(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateFromRandomPageInput
): Promise<RandomPageGenerationResult> {
  const minPage = input.minPage ?? 1;

  let referenceExcerpts: string[] | undefined;
  if (input.type === 'reading') {
    const { data: refs } = await (supabase.from('reference_materials') as any)
      .select('content')
      .ilike('name', '%독해%')
      .limit(2);
    referenceExcerpts = (refs ?? []).map((r: any) => r.content);
  }

  let lastError: unknown;
  const triedPages = new Set<number>();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pageNum = randomUntriedPage(minPage, input.maxPage, triedPages);
    triedPages.add(pageNum);
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

      const review = await reviewGeneratedQuestion(aiClient, page.content, generated);
      if (!review.ok) {
        lastError = review.error;
        continue;
      }

      // Trust the page we actually fed in, not Claude's self-reported sourcePage — we know
      // definitively which page this question came from since exactly one was provided.
      return { ...generated, sourcePage: page.page_num, usedReference: !!referenceExcerpts?.length };
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const { data: allPages } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .gte('page_num', minPage)
      .lte('page_num', input.maxPage);
    if (allPages?.length) {
      const combined = allPages.map((p: any) => ({ pageNum: p.page_num, content: p.content }));
      const [generated] = await generateQuestions(aiClient, {
        bookName: input.bookName,
        pages: combined,
        types: [input.type],
        referenceExcerpts,
      });

      const combinedContent = combined.map((p: any) => p.content).join('\n\n');
      const review = await reviewGeneratedQuestion(aiClient, combinedContent, generated);
      if (review.ok) {
        // Now Claude picked among many pages, so its sourcePage can't be trusted blindly —
        // clamp into range the same way the daily session's essay path already does.
        const sourcePage = Math.min(Math.max(Number(generated.sourcePage) || minPage, minPage), input.maxPage);
        return { ...generated, sourcePage, usedReference: !!referenceExcerpts?.length };
      }
      lastError = review.error;
    }
  } catch (err) {
    lastError = err;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No page content found for question generation');
}
