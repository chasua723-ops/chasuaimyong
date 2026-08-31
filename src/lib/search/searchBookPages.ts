import type { SupabaseClient } from '@supabase/supabase-js';

export interface SearchMatch {
  bookId: string;
  bookName: string;
  pageNum: number;
  content: string;
}

const MAX_MATCHES = 30;

function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function searchBookPages(supabase: SupabaseClient, query: string): Promise<SearchMatch[]> {
  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('book_id, page_num, content')
    .ilike('content', `%${escapeLikePattern(query)}%`)
    .order('book_id', { ascending: true })
    .order('page_num', { ascending: true })
    .limit(MAX_MATCHES);
  if (pagesError) throw new Error(`Failed to search book pages: ${pagesError.message}`);

  const { data: books, error: booksError } = await (supabase.from('books') as any).select('id, name');
  if (booksError) throw new Error(`Failed to fetch books: ${booksError.message}`);
  const bookNameById = new Map<string, string>((books ?? []).map((b: any) => [b.id, b.name]));

  // Sort client-side rather than relying on Supabase's .order() — this repo's mock Supabase
  // helper doesn't implement ordering, and other functions in this codebase (e.g. getTopicDetail)
  // already sort client-side for the same reason, keeping behavior identical in tests and prod.
  const sorted = [...(pages ?? [])].sort((a: any, b: any) =>
    a.book_id === b.book_id ? a.page_num - b.page_num : String(a.book_id).localeCompare(b.book_id)
  );

  return sorted.slice(0, MAX_MATCHES).map((p: any) => ({
    bookId: p.book_id,
    bookName: bookNameById.get(p.book_id) ?? '',
    pageNum: p.page_num,
    content: p.content,
  }));
}
