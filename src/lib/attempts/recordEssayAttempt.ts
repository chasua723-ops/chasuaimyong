import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { gradeEssay } from '@/lib/ai/gradeEssay';

export interface RecordEssayAttemptInput {
  questionId: string;
  koreanDraft: string;
  chineseAnswer: string;
}

export async function recordEssayAttempt(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RecordEssayAttemptInput
) {
  const { data: question } = await (supabase.from('questions') as any)
    .select('*')
    .eq('id', input.questionId)
    .single();
  if (!question) throw new Error('Question not found');

  const { data: page } = await (supabase.from('book_pages') as any)
    .select('content')
    .eq('book_id', question.book_id)
    .eq('page_num', question.source_page)
    .single();

  const grade = await gradeEssay(aiClient, {
    bookName: '',
    pages: [{ pageNum: question.source_page, content: page?.content ?? '' }],
    questionPrompt: question.prompt,
    koreanDraft: input.koreanDraft,
    chineseAnswer: input.chineseAnswer,
  });

  await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    korean_draft: input.koreanDraft,
    chinese_answer: input.chineseAnswer,
    content_score: grade.contentScore,
    chinese_score: grade.chineseScore,
    ai_feedback: grade.feedback,
  });

  return grade;
}
