import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChapterRange } from './computeTopicRanges';

export async function insertTopics(
  supabase: SupabaseClient,
  bookId: string,
  chapters: ChapterRange[]
): Promise<number> {
  let count = 0;
  for (const chapter of chapters) {
    const { data: parentRow, error: parentError } = await (supabase.from('topics') as any)
      .insert({
        book_id: bookId,
        parent_id: null,
        name: chapter.name,
        start_page: chapter.startPage,
        end_page: chapter.endPage,
      })
      .select()
      .single();
    if (parentError) {
      throw new Error(`Failed to insert chapter "${chapter.name}": ${parentError.message}`);
    }
    count += 1;

    for (const child of chapter.children) {
      const { error: childError } = await (supabase.from('topics') as any).insert({
        book_id: bookId,
        parent_id: parentRow.id,
        name: child.name,
        start_page: child.startPage,
        end_page: child.endPage,
      });
      if (childError) {
        throw new Error(`Failed to insert topic "${child.name}": ${childError.message}`);
      }
      count += 1;
    }
  }
  return count;
}
