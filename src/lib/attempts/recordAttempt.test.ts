import { describe, it, expect, vi } from 'vitest';
import { recordAttempt } from './recordAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { explainAnswer } from '../ai/explainAnswer';

vi.mock('../ai/explainAnswer', () => ({
  explainAnswer: vi.fn().mockResolvedValue('把자문은 목적어를 동사 앞에 둡니다'),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    questions: [
      {
        id: 'q1',
        book_id: 'b1',
        source_page: 12,
        prompt: '把자문의 어순은?',
        correct_answer: '주어+把+목적어+동사',
        type: 'grammar',
      },
    ],
    book_pages: [{ book_id: 'b1', page_num: 12, content: '把자문 설명' }],
    attempts: [],
    category_stats: [],
    ...overrides,
  };
}

describe('recordAttempt', () => {
  it('marks a correct answer without generating an explanation', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      userAnswer: '주어+把+목적어+동사',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.explanation).toBeNull();
    expect(supabase.inserted.attempts[0]).toMatchObject({ is_correct: true });
    expect(explainAnswer).not.toHaveBeenCalled();
  });

  it('generates a book-grounded explanation and increments category stats on a wrong answer', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      userAnswer: '틀린 답',
    });

    expect(result.isCorrect).toBe(false);
    expect(result.explanation).toBe('把자문은 목적어를 동사 앞에 둡니다');
    expect(result.sourcePage).toBe(12);
    expect(supabase.inserted.category_stats[0]).toMatchObject({
      type: 'grammar',
      correct_count: 0,
      total_count: 1,
    });
  });

  it('throws a diagnosable error when the attempts insert fails', async () => {
    const question = baseTables().questions[0];
    const supabase = {
      from: (table: string) => {
        if (table === 'attempts') {
          return {
            insert: async () => ({ data: null, error: { message: 'duplicate key value' } }),
          };
        }
        const api: any = {
          select: () => api,
          eq: () => api,
          single: async () => ({ data: question, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return api;
      },
    };

    await expect(
      recordAttempt(supabase as any, {} as any, {
        questionId: 'q1',
        userAnswer: '주어+把+목적어+동사',
      })
    ).rejects.toThrow('Failed to insert attempt: duplicate key value');
  });

  it('updates an existing category_stats row in place on a wrong answer, without inserting a new one', async () => {
    // Wrong answer chosen so we can assert total_count increments while
    // correct_count is left untouched -- the branch most likely to hide a
    // swapped-field or wrong-row-targeted regression.
    const supabase = createMockSupabase(
      baseTables({
        category_stats: [{ id: 'stat1', type: 'grammar', correct_count: 3, total_count: 4 }],
      })
    );

    await recordAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      userAnswer: '틀린 답',
    });

    // No new row should have been inserted -- this must be an update.
    expect(supabase.inserted.category_stats ?? []).toHaveLength(0);

    // Re-query the table to see the mutated persistent store (the mock's
    // update().eq() mutates store[table] in place per Task 14).
    const { data: updated } = await (supabase.from('category_stats') as any)
      .select('*')
      .eq('id', 'stat1')
      .single();

    expect(updated).toMatchObject({
      id: 'stat1',
      type: 'grammar',
      correct_count: 3,
      total_count: 5,
    });
  });
});
