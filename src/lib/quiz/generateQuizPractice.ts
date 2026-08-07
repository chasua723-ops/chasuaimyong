import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '../adaptive';
import { generateFromRandomPage } from './generateFromRandomPage';

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

  const generated = await generateFromRandomPage(supabase, aiClient, {
    bookId: input.bookId,
    bookName: book.name,
    maxPage: Math.max(1, book.current_page),
    type,
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
      used_reference: generated.usedReference,
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
