import { describe, it, expect } from 'vitest';
import { advanceProgress } from './advanceProgress';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [
      {
        id: 'b1',
        name: '문법',
        total_pages: 100,
        exam_date: '2026-12-01',
        target_read_count: 3,
        current_read_count: 1,
        current_page: 11,
      },
    ],
    ...overrides,
  };
}

describe('advanceProgress', () => {
  it("advances current_page to the day after today's assigned range", async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await advanceProgress(supabase as any, '2026-08-09', { bookId: 'b1' });

    // pacing for this fixture yields a small multi-page range starting at 11 (see pacing.test.ts
    // for the formula); whatever endPage it computes, currentPage must land right after it.
    expect(result.currentPage).toBe(result.range.startPage);
    expect(result.currentPage).toBeGreaterThan(11);
    expect(result.currentReadCount).toBe(1);
  });

  it('wraps to page 1 and increments current_read_count when advancing past the last page', async () => {
    const supabase = createMockSupabase(
      baseTables({
        books: [
          {
            id: 'b1',
            name: '문법',
            total_pages: 15,
            // Exam tomorrow forces pagesPerDay to cover all 4 remaining pages (12~15) today,
            // so this fixture's range.endPage actually lands on the book's last page.
            exam_date: '2026-08-10',
            target_read_count: 1,
            current_read_count: 1,
            current_page: 12,
          },
        ],
      })
    );

    const result = await advanceProgress(supabase as any, '2026-08-09', { bookId: 'b1' });

    expect(result.currentPage).toBe(1);
    expect(result.currentReadCount).toBe(2);
  });

  it('persists the update to the books table', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await advanceProgress(supabase as any, '2026-08-09', { bookId: 'b1' });

    const { data: reloaded } = await (supabase.from('books') as any).select('*').eq('id', 'b1').maybeSingle();
    expect(reloaded.current_page).toBe(result.currentPage);
    expect(reloaded.current_read_count).toBe(result.currentReadCount);
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(advanceProgress(supabase as any, '2026-08-09', { bookId: 'missing' })).rejects.toThrow(
      'Book not found'
    );
  });
});
