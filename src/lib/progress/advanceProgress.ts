import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateDailyRange } from '@/lib/pacing';

export interface AdvanceProgressInput {
  bookId: string;
}

export interface AdvanceProgressResult {
  bookId: string;
  currentPage: number;
  currentReadCount: number;
  range: { startPage: number; endPage: number };
}

export async function advanceProgress(
  supabase: SupabaseClient,
  today: string,
  input: AdvanceProgressInput
): Promise<AdvanceProgressResult> {
  const { data: book } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (!book) throw new Error('Book not found');

  const range = calculateDailyRange({
    totalPages: book.total_pages,
    examDate: book.exam_date,
    today,
    targetReadCount: book.target_read_count,
    currentReadCount: book.current_read_count,
    currentPage: book.current_page,
  });

  let newCurrentPage = range.endPage + 1;
  let newCurrentReadCount = book.current_read_count;
  if (newCurrentPage > book.total_pages) {
    // Finished a full read-through — start the next one from page 1.
    newCurrentPage = 1;
    newCurrentReadCount += 1;
  }

  const { error } = await (supabase.from('books') as any)
    .update({ current_page: newCurrentPage, current_read_count: newCurrentReadCount })
    .eq('id', input.bookId);
  if (error) throw new Error(`Failed to update progress: ${error.message}`);

  const newRange = calculateDailyRange({
    totalPages: book.total_pages,
    examDate: book.exam_date,
    today,
    targetReadCount: book.target_read_count,
    currentReadCount: newCurrentReadCount,
    currentPage: newCurrentPage,
  });

  return {
    bookId: input.bookId,
    currentPage: newCurrentPage,
    currentReadCount: newCurrentReadCount,
    range: { startPage: newRange.startPage, endPage: newRange.endPage },
  };
}
