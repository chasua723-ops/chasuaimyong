import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrGenerateExplanation } from './getOrGenerateExplanation';
import { explainTopic } from '../ai/explainTopic';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/explainTopic', () => ({
  explainTopic: vi.fn().mockResolvedValue('새로 생성된 해설'),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    topics: [
      {
        id: 't1',
        book_id: 'b1',
        parent_id: null,
        name: '수사',
        start_page: 30,
        end_page: 30,
        explanation: null,
      },
    ],
    books: [{ id: 'b1', name: '전공중국어 문법' }],
    book_pages: [{ book_id: 'b1', page_num: 30, content: '30페이지 내용' }],
    ...overrides,
  };
}

describe('getOrGenerateExplanation', () => {
  beforeEach(() => {
    vi.mocked(explainTopic).mockClear();
  });

  it('generates and persists an explanation when none is cached', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await getOrGenerateExplanation(supabase as any, {} as any, 't1');

    expect(result).toBe('새로 생성된 해설');
    expect(vi.mocked(explainTopic)).toHaveBeenCalledWith(
      {},
      { bookName: '전공중국어 문법', topicName: '수사', content: '30페이지 내용' }
    );
  });

  it('returns the cached explanation without calling the AI again', async () => {
    const supabase = createMockSupabase(
      baseTables({
        topics: [
          {
            id: 't1',
            book_id: 'b1',
            parent_id: null,
            name: '수사',
            start_page: 30,
            end_page: 30,
            explanation: '이미 있음',
          },
        ],
      })
    );

    const result = await getOrGenerateExplanation(supabase as any, {} as any, 't1');

    expect(result).toBe('이미 있음');
    expect(vi.mocked(explainTopic)).not.toHaveBeenCalled();
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(
      getOrGenerateExplanation(supabase as any, {} as any, 'missing')
    ).rejects.toThrow('Topic not found');
  });

  it('throws instead of asking the AI to explain from no content, when the page range has no book_pages rows', async () => {
    // Reproduces a real bug: a topic with an inverted/empty page range fetched zero book_pages
    // rows, and the AI's honest "I have no content to explain from" refusal got cached as if it
    // were a real explanation. Fail loudly instead of ever calling the AI on empty content.
    const supabase = createMockSupabase(baseTables({ book_pages: [] }));

    await expect(
      getOrGenerateExplanation(supabase as any, {} as any, 't1')
    ).rejects.toThrow('No book_pages content found');
    expect(vi.mocked(explainTopic)).not.toHaveBeenCalled();
  });
});
