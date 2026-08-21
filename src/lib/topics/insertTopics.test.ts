import { describe, it, expect } from 'vitest';
import { insertTopics } from './insertTopics';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('insertTopics', () => {
  it('inserts each chapter and its children, wiring each child to its own parent via parent_id', async () => {
    const supabase = createMockSupabase({ topics: [] });

    const count = await insertTopics(supabase as any, 'b1', [
      {
        name: '1장 품사론',
        startPage: 1,
        endPage: 20,
        children: [
          { name: '1절 명사', startPage: 1, endPage: 10 },
          { name: '2절 수사', startPage: 11, endPage: 20 },
        ],
      },
      { name: '2장 문장론', startPage: 21, endPage: 30, children: [] },
    ]);

    expect(count).toBe(4);
    const inserted = supabase.inserted.topics;
    expect(inserted).toHaveLength(4);

    const chapter1 = inserted.find((r: any) => r.name === '1장 품사론');
    const chapter2 = inserted.find((r: any) => r.name === '2장 문장론');
    const child1 = inserted.find((r: any) => r.name === '1절 명사');
    const child2 = inserted.find((r: any) => r.name === '2절 수사');

    expect(chapter1).toMatchObject({ book_id: 'b1', parent_id: null, start_page: 1, end_page: 20 });
    expect(chapter2).toMatchObject({ book_id: 'b1', parent_id: null, start_page: 21, end_page: 30 });
    expect(child1.parent_id).toBeTruthy();
    expect(child2.parent_id).toBe(child1.parent_id);
  });
});
