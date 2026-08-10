import { describe, it, expect, vi } from 'vitest';
import { recordEssayAttempt } from './recordEssayAttempt';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { gradeEssay } from '../ai/gradeEssay';

vi.mock('../ai/gradeEssay', () => ({
  gradeEssay: vi.fn().mockResolvedValue({
    conceptScore: 3,
    conceptChecklist: [
      { concept: '개념1', covered: true },
      { concept: '개념2', covered: false },
      { concept: '개념3', covered: true },
      { concept: '개념4', covered: true },
    ],
    grammarCorrections: [{ original: '错误句子', corrected: '正确句子', explanation: '설명' }],
  }),
}));

function baseTables() {
  return {
    questions: [
      { id: 'q1', book_id: 'b1', source_page: 30, prompt: '루쉰 문학의 특징을 서술하시오' },
    ],
    books: [{ id: 'b1', name: '중국문학사' }],
    book_pages: [{ book_id: 'b1', page_num: 30, content: '루쉰의 광인일기' }],
    attempts: [],
  };
}

describe('recordEssayAttempt', () => {
  it('saves the concept score, checklist, and grammar corrections', async () => {
    const supabase = createMockSupabase(baseTables());

    const result = await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '루쉰은 사실주의 기법으로...',
      chineseAnswer: '鲁迅用现实主义手法...',
    });

    expect(result.conceptScore).toBe(3);
    expect(supabase.inserted.attempts[0]).toMatchObject({
      question_id: 'q1',
      korean_draft: '루쉰은 사실주의 기법으로...',
      chinese_answer: '鲁迅用现实主义手法...',
      concept_score: 3,
      concept_checklist: [
        { concept: '개념1', covered: true },
        { concept: '개념2', covered: false },
        { concept: '개념3', covered: true },
        { concept: '개념4', covered: true },
      ],
      grammar_corrections: [{ original: '错误句子', corrected: '正确句子', explanation: '설명' }],
    });
  });

  it('passes the real book name to the grader instead of an empty string', async () => {
    const supabase = createMockSupabase(baseTables());

    await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '초안',
      chineseAnswer: '答案',
    });

    expect(gradeEssay).toHaveBeenCalledWith(
      {} as any,
      expect.objectContaining({ bookName: '중국문학사' })
    );
  });

  it('strips [[ ]] highlight markers from the question prompt before grading', async () => {
    const supabase = createMockSupabase({
      ...baseTables(),
      questions: [
        { id: 'q1', book_id: 'b1', source_page: 30, prompt: '[[鲁迅]]문학의 특징을 서술하시오' },
      ],
    });

    await recordEssayAttempt(supabase as any, {} as any, {
      questionId: 'q1',
      koreanDraft: '초안',
      chineseAnswer: '答案',
    });

    expect(gradeEssay).toHaveBeenCalledWith(
      {} as any,
      expect.objectContaining({ questionPrompt: '鲁迅문학의 특징을 서술하시오' })
    );
  });
});
