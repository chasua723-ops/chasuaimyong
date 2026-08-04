import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionType } from '@/types/db';

export interface ProgressSummary {
  books: {
    name: string;
    percentComplete: number;
    currentReadCount: number;
    targetReadCount: number;
  }[];
  categoryAccuracy: Partial<Record<QuestionType, number>>;
}

export async function getProgress(supabase: SupabaseClient): Promise<ProgressSummary> {
  const { data: books } = await (supabase.from('books') as any).select('*');
  const { data: stats } = await (supabase.from('category_stats') as any).select('*');

  const bookSummaries = (books ?? []).map((b: any) => ({
    name: b.name,
    percentComplete: Math.round(((b.current_page - 1) / b.total_pages) * 100),
    currentReadCount: b.current_read_count,
    targetReadCount: b.target_read_count,
  }));

  const categoryAccuracy: Partial<Record<QuestionType, number>> = {};
  for (const s of stats ?? []) {
    categoryAccuracy[s.type as QuestionType] = s.total_count === 0 ? 0 : s.correct_count / s.total_count;
  }

  return { books: bookSummaries, categoryAccuracy };
}
