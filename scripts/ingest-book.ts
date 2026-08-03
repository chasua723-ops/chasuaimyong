import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractPagesFromBuffer } from '../src/lib/pdf/extractPages';

export interface IngestBookArgs {
  filePath: string;
  bookName: string;
  examDate: string;
  targetReadCount: number;
}

export async function ingestBook(args: IngestBookArgs, supabase: SupabaseClient) {
  const buffer = await readFile(args.filePath);
  const pages = await extractPagesFromBuffer(buffer);

  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      name: args.bookName,
      total_pages: pages.length,
      exam_date: args.examDate,
      target_read_count: args.targetReadCount,
      current_read_count: 1,
      current_page: 1,
    })
    .select()
    .single();

  if (bookError) throw bookError;

  const rows = pages.map((p) => ({ book_id: book.id, page_num: p.pageNum, content: p.content }));
  const { error: pagesError } = await supabase.from('book_pages').insert(rows);
  if (pagesError) throw pagesError;

  return book;
}
