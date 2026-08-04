import { describe, it, expect, vi } from 'vitest';
import { recordEssayAttempt } from './recordEssayAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

vi.mock('../ai/gradeEssay', () => ({
  gradeEssay: vi.fn().mockResolvedValue({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' }),
}));

describe('recordEssayAttempt', () => {
  it('saves the Korean draft and Chinese answer separately with their AI scores', async () => {
    const supabase = createMockSupabase({
      questions: [
        {
          id: 'q1',
          book_id: 'b1',
          source_page: 30,
          prompt: '루쉰 문학의 특징을 서술하시오',
        },
      ],
      book_pages: [{ book_id: 'b1', page_num: 30, content: '루쉰의 광인일기' }],
      attempts: [],
    });

    const result = await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result).toEqual({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' });
    expect(supabase.inserted.attempts[0]).toMatchObject({
      question_id: 'q1',
      korean_draft: '루쉰은 사실주의 기법으로...',
      chinese_answer: '鲁迅用现实主义手法...',
      content_score: 75,
      chinese_score: 55,
      ai_feedback: '표현 개선 필요',
    });
  });
});
