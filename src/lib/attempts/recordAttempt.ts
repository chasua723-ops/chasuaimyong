import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { explainAnswer } from '@/lib/ai/explainAnswer';

export interface RecordAttemptInput {
  questionId: string;
  userAnswer: string;
}

export async function recordAttempt(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RecordAttemptInput
) {
  const { data: question } = await (supabase.from('questions') as any)
    .select('*')
    .eq('id', input.questionId)
    .single();
  if (!question) throw new Error('Question not found');

  const isCorrect = question.correct_answer.trim() === input.userAnswer.trim();
  let explanation: string | null = null;

  if (!isCorrect) {
    const { data: page } = await (supabase.from('book_pages') as any)
      .select('content')
      .eq('book_id', question.book_id)
      .eq('page_num', question.source_page)
      .single();

    explanation = await explainAnswer(aiClient, {
      bookName: '',
      sourcePage: question.source_page,
      pageContent: page?.content ?? '',
      questionPrompt: question.prompt,
      correctAnswer: question.correct_answer,
      userAnswer: input.userAnswer,
    });
  }

  await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    user_answer: input.userAnswer,
    is_correct: isCorrect,
    explanation,
  });

  const { data: statRow } = await (supabase.from('category_stats') as any)
    .select('*')
    .eq('type', question.type)
    .maybeSingle();

  if (statRow) {
    await (supabase.from('category_stats') as any)
      .update({
        correct_count: statRow.correct_count + (isCorrect ? 1 : 0),
        total_count: statRow.total_count + 1,
      })
      .eq('id', statRow.id);
  } else {
    await (supabase.from('category_stats') as any).insert({
      type: question.type,
      correct_count: isCorrect ? 1 : 0,
      total_count: 1,
    });
  }

  return { isCorrect, explanation, sourcePage: question.source_page };
}
