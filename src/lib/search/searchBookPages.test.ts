import { describe, it, expect } from 'vitest';
import { searchBookPages } from './searchBookPages';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [
      { id: 'b1', name: '문법' },
      { id: 'b2', name: '문학개론' },
    ],
    book_pages: [
      { book_id: 'b1', page_num: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' },
      { book_id: 'b1', page_num: 5, content: '겸어문에 대한 설명' },
      { book_id: 'b2', page_num: 3, content: '把자문에 대한 문학적 접근' },
    ],
    ...overrides,
  };
}

describe('searchBookPages', () => {
  it('matches book_pages content across all books, grouped by book and ordered by page', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await searchBookPages(supabase as any, '把자문');

    expect(result).toEqual([
      { bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문은 목적어를 동사 앞으로 이동시킨다' },
      { bookId: 'b2', bookName: '문학개론', pageNum: 3, content: '把자문에 대한 문학적 접근' },
    ]);
  });

  it('returns an empty array when nothing matches', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await searchBookPages(supabase as any, '존재하지않는단어들');

    expect(result).toEqual([]);
  });

  it('caps results at 30 matches', async () => {
    const manyPages = Array.from({ length: 40 }, (_, i) => ({
      book_id: 'b1',
      page_num: i + 1,
      content: `공통검색어 페이지 ${i + 1}`,
    }));
    const supabase = createMockSupabase(baseTables({ book_pages: manyPages }));

    const result = await searchBookPages(supabase as any, '공통검색어');

    expect(result).toHaveLength(30);
  });

  it('treats a literal % in the query as a literal character, not a wildcard', async () => {
    // Without escaping, the '%' in the query would act as a SQL wildcard matching zero or
    // more characters, so '가%나' would spuriously match content like '가나다라' (which merely
    // has '가' immediately followed by '나', satisfying the wildcard with zero characters in
    // between) even though it never contains the literal text the user searched for.
    const supabase = createMockSupabase(
      baseTables({
        book_pages: [{ book_id: 'b1', page_num: 1, content: '가나다라' }],
      })
    );

    const result = await searchBookPages(supabase as any, '가%나');

    expect(result).toEqual([]);
  });
});
