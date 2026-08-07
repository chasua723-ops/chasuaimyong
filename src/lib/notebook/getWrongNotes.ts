import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface WrongNoteQuestion {
  id: string;
  prompt: string;
  choices: string[] | null;
  sourcePage: number;
  bookName: string;
  overcome: boolean;
  attemptCount: number;
}

export interface WrongNoteGroup {
  type: QuestionType;
  label: string;
  outstandingCount: number;
  totalCount: number;
  questions: WrongNoteQuestion[];
}

const TYPE_ORDER: QuestionType[] = ['grammar', 'vocab', 'reading', 'theory'];
const TYPE_LABELS: Record<string, string> = {
  grammar: '문법',
  vocab: '어휘',
  reading: '독해',
  theory: '이론',
};

export async function getWrongNotes(supabase: SupabaseClient): Promise<WrongNoteGroup[]> {
  const { data: questions } = await (supabase.from('questions') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: attempts } = await (supabase.from('attempts') as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  const { data: books } = await (supabase.from('books') as any).select('*');

  const bookNameById = new Map<string, string>((books ?? []).map((b: any) => [b.id, b.name]));

  const attemptsByQuestion = new Map<string, any[]>();
  for (const attempt of attempts ?? []) {
    const list = attemptsByQuestion.get(attempt.question_id) ?? [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.question_id, list);
  }

  const groupsByType = new Map<string, WrongNoteGroup>();

  for (const question of questions ?? []) {
    if (question.type === 'essay') continue;

    const attemptsForQuestion = (attemptsByQuestion.get(question.id) ?? [])
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (attemptsForQuestion.length === 0) continue;

    const hasEverBeenWrong = attemptsForQuestion.some((a) => a.is_correct === false);
    if (!hasEverBeenWrong) continue;

    const latestAttempt = attemptsForQuestion[attemptsForQuestion.length - 1];
    const overcome = latestAttempt.is_correct === true;

    if (!groupsByType.has(question.type)) {
      groupsByType.set(question.type, {
        type: question.type,
        label: TYPE_LABELS[question.type] ?? question.type,
        outstandingCount: 0,
        totalCount: 0,
        questions: [],
      });
    }

    const group = groupsByType.get(question.type)!;
    group.totalCount += 1;
    if (!overcome) group.outstandingCount += 1;
    group.questions.push({
      id: question.id,
      prompt: question.prompt,
      choices: question.choices ?? null,
      sourcePage: question.source_page,
      bookName: bookNameById.get(question.book_id) ?? '',
      overcome,
      attemptCount: attemptsForQuestion.length,
    });
  }

  return TYPE_ORDER.filter((type) => groupsByType.has(type)).map((type) => groupsByType.get(type)!);
}
