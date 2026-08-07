import { describe, it, expect } from 'vitest';
import { getEssayNotes } from './getEssayNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    attempts: [],
    questions: [],
    books: [{ id: 'b1', name: '문학개론' }],
    ...overrides,
  };
}

describe('getEssayNotes', () => {
  it('returns an essay attempt with its concept checklist and book name', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '鲁迅文学的特点是什么？' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            korean_draft: '초안',
            chinese_answer: '鲁迅用现实主义手法...',
            concept_score: 3,
            concept_checklist: [
              { concept: '사실주의 기법', covered: true },
              { concept: '광인일기의 상징', covered: false },
              { concept: '봉건 사회 비판', covered: true },
              { concept: '백화문 사용', covered: true },
            ],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'a1',
      questionPrompt: '鲁迅文学的特点是什么？',
      bookName: '문학개론',
      conceptScore: 3,
    });
  });

  it('includes an attempt with a score of 0 — no filtering by score', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '질문' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            korean_draft: '',
            chinese_answer: '',
            concept_score: 0,
            concept_checklist: [
              { concept: 'A', covered: false },
              { concept: 'B', covered: false },
              { concept: 'C', covered: false },
              { concept: 'D', covered: false },
            ],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0].conceptScore).toBe(0);
  });

  it('excludes quiz attempts (no concept_score) even for the same question type table', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '문제' }],
        attempts: [
          {
            id: 'a1',
            question_id: 'q1',
            is_correct: true,
            concept_score: null,
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes).toHaveLength(0);
  });

  it('sorts notes newest first', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', prompt: '문제' }],
        attempts: [
          {
            id: 'old',
            question_id: 'q1',
            concept_score: 1,
            concept_checklist: [],
            grammar_corrections: [],
            created_at: '2026-08-01T00:00:00Z',
          },
          {
            id: 'new',
            question_id: 'q1',
            concept_score: 2,
            concept_checklist: [],
            grammar_corrections: [],
            created_at: '2026-08-05T00:00:00Z',
          },
        ],
      })
    );

    const notes = await getEssayNotes(supabase as any);

    expect(notes.map((n) => n.id)).toEqual(['new', 'old']);
  });
});
