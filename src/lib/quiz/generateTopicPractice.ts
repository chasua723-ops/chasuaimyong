import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { QuestionType } from '@/types/db';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from '../adaptive';
import { generateFromRandomPage } from './generateFromRandomPage';

export interface GenerateTopicPracticeInput {
  topicId: string;
}

export interface TopicPracticeQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
}

export async function generateTopicPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateTopicPracticeInput
): Promise<TopicPracticeQuestion> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', input.topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${input.topicId}`);

  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', topic.book_id)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${topic.book_id}`);

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
    bookId: topic.book_id,
    bookName: book.name,
    minPage: topic.start_page,
    maxPage: topic.end_page,
    type,
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: topic.book_id,
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
  if (error) throw new Error(`Failed to insert topic practice question: ${error.message}`);

  return {
    id: inserted.id,
    type: inserted.type,
    prompt: inserted.prompt,
    choices: inserted.choices ?? null,
    sourcePage: inserted.source_page,
  };
}
