import { describe, it, expect, vi } from 'vitest';
import { generateTopicPractice } from './generateTopicPractice';
import { generateFromRandomPage } from './generateFromRandomPage';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('./generateFromRandomPage', () => ({
  generateFromRandomPage: vi.fn().mockResolvedValue({
    type: 'grammar',
    sourcePage: 34,
    prompt: '문제입니다',
    choices: ['A', 'B'],
    correctAnswer: 'A',
    usedReference: false,
  }),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 5 }],
    topics: [{ id: 't1', book_id: 'b1', name: '수사', start_page: 30, end_page: 40 }],
    category_stats: [],
    questions: [],
    ...overrides,
  };
}

describe('generateTopicPractice', () => {
  it("generates a question scoped to the topic's own page range, not the book's current_page, and stores it with no session", async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateTopicPractice(supabase as any, {} as any, { topicId: 't1' });

    expect(result.prompt).toBe('문제입니다');
    expect(vi.mocked(generateFromRandomPage)).toHaveBeenCalledWith(
      supabase,
      {},
      expect.objectContaining({ bookId: 'b1', minPage: 30, maxPage: 40 })
    );
    expect(supabase.inserted.questions[0]).toMatchObject({ book_id: 'b1', session_id: null });
    randomSpy.mockRestore();
  });

  it('throws when the topic is not found', async () => {
    const supabase = createMockSupabase(baseTables({ topics: [] }));

    await expect(
      generateTopicPractice(supabase as any, {} as any, { topicId: 'missing' })
    ).rejects.toThrow('Topic not found');
  });

  it('throws when the topic references a missing book', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateTopicPractice(supabase as any, {} as any, { topicId: 't1' })
    ).rejects.toThrow('Book not found');
  });
});
