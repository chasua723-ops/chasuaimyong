import { describe, it, expect } from 'vitest';
import { getTopicDetail } from './getTopicDetail';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    topics: [
      {
        id: 't1',
        book_id: 'b1',
        parent_id: null,
        name: '수사',
        start_page: 30,
        end_page: 32,
        explanation: null,
      },
    ],
    book_pages: [
      { book_id: 'b1', page_num: 30, content: '30페이지 내용' },
      { book_id: 'b1', page_num: 31, content: '31페이지 내용' },
      { book_id: 'b1', page_num: 32, content: '32페이지 내용' },
    ],
    ...overrides,
  };
}

describe('getTopicDetail', () => {
  it('returns the topic, its page content concatenated in page order, and a null explanation when none is cached', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await getTopicDetail(supabase as any, 't1');

    expect(result.topic).toEqual({ id: 't1', name: '수사', startPage: 30, endPage: 32 });
    expect(result.content).toBe('30페이지 내용\n\n31페이지 내용\n\n32페이지 내용');
    expect(result.explanation).toBeNull();
  });

  it('returns the cached explanation when present', async () => {
    const supabase = createMockSupabase(
      baseTables({
        topics: [
          {
            id: 't1',
            book_id: 'b1',
            parent_id: null,
            name: '수사',
            start_page: 30,
            end_page: 32,
            explanation: '기존 해설',
          },
        ],
      })
    );

    const result = await getTopicDetail(supabase as any, 't1');

    expect(result.explanation).toBe('기존 해설');
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(getTopicDetail(supabase as any, 'missing')).rejects.toThrow('Topic not found');
  });
});
