import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface QuizPracticeNote {
  id: string;
  bookName: string;
  type: QuestionType;
  prompt: string;
  choices: string[] | null;
  userAnswer: string;
  isCorrect: boolean;
  sourcePage: number;
  createdAt: string;
}

export async function getQuizPracticeNotes(supabase: SupabaseClient): Promise<QuizPracticeNote[]> {
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

  const notes: QuizPracticeNote[] = [];
  for (const attempt of attempts ?? []) {
    const question = questionById.get(attempt.question_id);
    if (!question) continue;
    if (question.session_id !== null || question.type === 'essay') continue;

    notes.push({
      id: attempt.id,
      bookName: bookNameById.get(question.book_id) ?? '',
      type: question.type,
      prompt: question.prompt,
      choices: question.choices ?? null,
      userAnswer: attempt.user_answer ?? '',
      isCorrect: !!attempt.is_correct,
      sourcePage: question.source_page,
      createdAt: attempt.created_at,
    });
  }

  notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return notes;
}
