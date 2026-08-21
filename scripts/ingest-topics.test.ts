// scripts/ingest-topics.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestTopics } from './ingest-topics';
import { parseTocWithAI } from '../src/lib/topics/parseTocWithAI';
import { createMockSupabase } from '../tests/helpers/mockSupabase';

vi.mock('../src/lib/topics/parseTocWithAI', () => ({
  parseTocWithAI: vi.fn().mockResolvedValue([
    {
      name: '1장',
      startPage: 1,
      children: [
        { name: '1절', startPage: 1 },
        { name: '2절', startPage: 5 },
      ],
    },
  ]),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', total_pages: 20 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '목차 1페이지' },
      { book_id: 'b1', page_num: 2, content: '목차 2페이지' },
    ],
    topics: [],
    ...overrides,
  };
}

describe('ingestTopics', () => {
  it('parses the TOC pages in order, computes ranges from the book total_pages, and inserts the resulting topics', async () => {
    const supabase = createMockSupabase(baseTables());

    const count = await ingestTopics(supabase as any, {} as any, {
      bookId: 'b1',
      tocStartPage: 1,
      tocEndPage: 2,
    });

    expect(count).toBe(3); // 1 chapter + 2 children
    expect(vi.mocked(parseTocWithAI)).toHaveBeenCalledWith(
      {},
      { bookName: '전공중국어 문법', tocText: '목차 1페이지\n목차 2페이지' }
    );
    const child2 = supabase.inserted.topics.find((r: any) => r.name === '2절');
    expect(child2).toMatchObject({ start_page: 5, end_page: 20 }); // last leaf extends to total_pages
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      ingestTopics(supabase as any, {} as any, { bookId: 'missing', tocStartPage: 1, tocEndPage: 2 })
    ).rejects.toThrow('Book not found');
  });

  it('throws when no book_pages exist in the given TOC page range', async () => {
    const supabase = createMockSupabase(baseTables({ book_pages: [] }));

    await expect(
      ingestTopics(supabase as any, {} as any, { bookId: 'b1', tocStartPage: 1, tocEndPage: 2 })
    ).rejects.toThrow('No book_pages found');
  });
});
