import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { gradeEssay } from '@/lib/ai/gradeEssay';
import { stripHighlightMarkers } from '@/lib/text/highlightMarkers';

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

  const { data: book } = await (supabase.from('books') as any)
    .select('name')
    .eq('id', question.book_id)
    .single();

  const grade = await gradeEssay(aiClient, {
    bookName: book?.name ?? '',
    pages: [{ pageNum: question.source_page, content: page?.content ?? '' }],
    questionPrompt: stripHighlightMarkers(question.prompt),
    koreanDraft: input.koreanDraft,
    chineseAnswer: input.chineseAnswer,
  });

  const { error: attemptError } = await (supabase.from('attempts') as any).insert({
    question_id: question.id,
    korean_draft: input.koreanDraft,
    chinese_answer: input.chineseAnswer,
    concept_score: grade.conceptScore,
    concept_checklist: grade.conceptChecklist,
    grammar_corrections: grade.grammarCorrections,
  });
  if (attemptError) throw new Error(`Failed to insert essay attempt: ${attemptError.message}`);

  return grade;
}
