import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConceptCheck, GrammarCorrection } from '@/types/db';

export interface EssayNote {
  id: string;
  questionPrompt: string;
  bookName: string;
  koreanDraft: string;
  chineseAnswer: string;
  modelAnswer: string;
  conceptScore: number;
  conceptChecklist: ConceptCheck[];
  grammarCorrections: GrammarCorrection[];
  createdAt: string;
}

export async function getEssayNotes(supabase: SupabaseClient): Promise<EssayNote[]> {
  const { data: attempts } = await (supabase.from('attempts') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: questions } = await (supabase.from('questions') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: books } = await (supabase.from('books') as any).select('*');

  const questionById = new Map<string, any>((questions ?? []).map((q: any) => [q.id, q]));
  const bookNameById = new Map<string, string>((books ?? []).map((b: any) => [b.id, b.name]));

  const notes: EssayNote[] = [];
  for (const attempt of attempts ?? []) {
    if (attempt.concept_score === null || attempt.concept_score === undefined) continue;
    const question = questionById.get(attempt.question_id);
    if (!question) continue;

    const bookName = bookNameById.get(question.book_id) ?? '';
    notes.push({
      id: attempt.id,
      questionPrompt: question.prompt as string,
      bookName,
      koreanDraft: attempt.korean_draft ?? '',
      chineseAnswer: attempt.chinese_answer ?? '',
      modelAnswer: question.correct_answer ?? '',
      conceptScore: attempt.concept_score,
      conceptChecklist: attempt.concept_checklist ?? [],
      grammarCorrections: attempt.grammar_corrections ?? [],
      createdAt: attempt.created_at,
    });
  }

  notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return notes;
}
