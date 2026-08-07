import { describe, it, expect } from 'vitest';
import { getWrongNotes } from './getWrongNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    questions: [],
    attempts: [],
    books: [{ id: 'b1', name: '전공중국어 문법' }],
    ...overrides,
  };
}

describe('getWrongNotes', () => {
  it('excludes a question that has never been answered incorrectly', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A'], source_page: 1 },
        ],
        attempts: [{ question_id: 'q1', is_correct: true, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('classifies a question whose latest attempt is wrong as outstanding', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'reading', prompt: 'Q1', choices: ['A', 'B'], source_page: 5 },
        ],
        attempts: [{ question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      type: 'reading',
      label: '독해',
      outstandingCount: 1,
      totalCount: 1,
    });
    expect(groups[0].questions[0]).toMatchObject({
      id: 'q1',
      overcome: false,
      attemptCount: 1,
      bookName: '전공중국어 문법',
    });
  });

  it('classifies a question as overcome when the latest attempt is correct after an earlier wrong attempt', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A', 'B'], source_page: 5 },
        ],
        attempts: [
          { question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
          { question_id: 'q1', is_correct: false, created_at: '2026-08-02T00:00:00Z' },
          { question_id: 'q1', is_correct: true, created_at: '2026-08-03T00:00:00Z' },
        ],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups[0]).toMatchObject({ outstandingCount: 0, totalCount: 1 });
    expect(groups[0].questions[0]).toMatchObject({ overcome: true, attemptCount: 3 });
  });

  it('excludes essay questions even when wrong', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', type: 'essay', prompt: 'Q1', choices: null, source_page: 5 }],
        attempts: [{ question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('excludes a question with no attempts at all', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [{ id: 'q1', book_id: 'b1', type: 'grammar', prompt: 'Q1', choices: ['A'], source_page: 1 }],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups).toHaveLength(0);
  });

  it('groups questions by type, ordered grammar, vocab, reading, theory', async () => {
    const supabase = createMockSupabase(
      baseTables({
        questions: [
          { id: 'q1', book_id: 'b1', type: 'theory', prompt: 'T1', choices: ['A'], source_page: 1 },
          { id: 'q2', book_id: 'b1', type: 'grammar', prompt: 'G1', choices: ['A'], source_page: 2 },
        ],
        attempts: [
          { question_id: 'q1', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
          { question_id: 'q2', is_correct: false, created_at: '2026-08-01T00:00:00Z' },
        ],
      })
    );

    const groups = await getWrongNotes(supabase as any);

    expect(groups.map((g) => g.type)).toEqual(['grammar', 'theory']);
  });
});
