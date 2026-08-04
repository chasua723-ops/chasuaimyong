import { describe, it, expect } from 'vitest';
import { getProgress } from './getProgress';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('getProgress', () => {
  it('returns per-book percent-complete and per-category accuracy', async () => {
    const supabase = createMockSupabase({
      books: [
        { id: 'b1', name: '문법', total_pages: 100, current_page: 51, current_read_count: 1, target_read_count: 3 },
      ],
      category_stats: [{ type: 'grammar', correct_count: 3, total_count: 4 }],
    });

    const result = await getProgress(supabase as any);

    expect(result.books[0]).toMatchObject({ name: '문법', percentComplete: 50, currentReadCount: 1, targetReadCount: 3 });
    expect(result.categoryAccuracy.grammar).toBeCloseTo(0.75, 5);
  });
});
