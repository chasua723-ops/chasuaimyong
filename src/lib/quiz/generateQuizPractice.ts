import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '../adaptive';
import { generateQuestions } from '../ai/generateQuestions';

export interface GenerateQuizPracticeInput {
  bookId: string;
}

export interface QuizPracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

function randomPage(maxPage: number): number {
  return Math.floor(Math.random() * maxPage) + 1;
}

export async function generateQuizPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateQuizPracticeInput
): Promise<QuizPracticeQuestion> {
  const { data: book } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (!book) throw new Error('Book not found');

  const { data: statsRows } = await (supabase.from('category_stats') as any).select('*');
  const stats: CategoryStat[] = (statsRows ?? []).map((r: any) => ({
    type: r.type,
    correctCount: r.correct_count,
    totalCount: r.total_count,
  }));
  const weights = calculateWeights(stats);
  const quizWeights = Object.fromEntries(
    QUIZ_TYPES.map((t) => [t, weights[t] ?? 0.5])
  ) as Record<(typeof QUIZ_TYPES)[number], number>;
  const [type] = pickWeightedTypes(quizWeights as any, 1);

  const maxPage = Math.max(1, book.current_page);

  let page: { page_num: number; content: string } | null = null;
  for (let attempt = 0; attempt < 2 && !page; attempt++) {
    const pageNum = randomPage(maxPage);
    const { data } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .eq('page_num', pageNum)
      .maybeSingle();
    page = data;
  }
  if (!page) throw new Error('No page content found for quiz practice');

  let referenceExcerpts: string[] | undefined;
  if (type === 'reading') {
    const { data: refs } = await (supabase.from('reference_materials') as any)
      .select('content')
      .ilike('name', '%독해%')
      .limit(2);
    referenceExcerpts = (refs ?? []).map((r: any) => r.content);
  }

  const [generated] = await generateQuestions(aiClient, {
    bookName: book.name,
    pages: [{ pageNum: page.page_num, content: page.content }],
    types: [type],
    referenceExcerpts,
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: input.bookId,
      session_id: null,
      type: generated.type,
      source_page: generated.sourcePage,
      prompt: generated.prompt,
      choices: generated.choices ?? null,
      correct_answer: generated.correctAnswer,
      used_reference: !!referenceExcerpts?.length,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert quiz practice question: ${error.message}`);

  return {
    id: inserted.id,
    type: inserted.type,
    prompt: inserted.prompt,
    choices: inserted.choices ?? null,
    sourcePage: inserted.source_page,
  };
}
