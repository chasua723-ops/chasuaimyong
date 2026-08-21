// scripts/ingest-topics.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { parseTocWithAI } from '../src/lib/topics/parseTocWithAI';
import { computeTopicRanges } from '../src/lib/topics/computeTopicRanges';
import { insertTopics } from '../src/lib/topics/insertTopics';

export interface IngestTopicsInput {
  bookId: string;
  tocStartPage: number;
  tocEndPage: number;
}

export async function ingestTopics(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: IngestTopicsInput
): Promise<number> {
  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${input.bookId}`);

  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', input.bookId)
    .gte('page_num', input.tocStartPage)
    .lte('page_num', input.tocEndPage);
  if (pagesError) throw new Error(`Failed to fetch TOC pages: ${pagesError.message}`);
  if (!pages || pages.length === 0) {
    throw new Error('No book_pages found in the given TOC page range');
  }

  const tocText = [...pages]
    .sort((a: any, b: any) => a.page_num - b.page_num)
    .map((p: any) => p.content)
    .join('\n');

  const chapters = await parseTocWithAI(aiClient, { bookName: book.name, tocText });
  const ranges = computeTopicRanges(chapters, book.total_pages);
  return insertTopics(supabase, input.bookId, ranges);
}
