import { describe, it, expect } from 'vitest';
import { getQuizPracticeNotes } from './getQuizPracticeNotes';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';

describe('getQuizPracticeNotes', () => {
  it('includes only questions with no session (on-demand practice), excluding essay', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', book_id: 'b1', session_id: null, type: 'grammar', prompt: '연습1', choices: ['A'], source_page: 3, created_at: '2026-08-01' },
        { id: 'q2', book_id: 'b1', session_id: 's1', type: 'grammar', prompt: '일일문제', choices: ['A'], source_page: 4, created_at: '2026-08-01' },
        { id: 'q3', book_id: 'b1', session_id: null, type: 'essay', prompt: '서술형', choices: null, source_page: 5, created_at: '2026-08-01' },
      ],
      attempts: [
        { id: 'a1', question_id: 'q1', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a2', question_id: 'q2', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a3', question_id: 'q3', user_answer: null, is_correct: null, created_at: '2026-08-01T10:00:00Z' },
      ],
      books: [{ id: 'b1', name: '전공중국어 문법' }],
    });

    const notes = await getQuizPracticeNotes(supabase as any);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: 'a1', bookName: '전공중국어 문법', prompt: '연습1', isCorrect: true });
  });

  it('produces one row per attempt, newest first, when a question was retried', async () => {
    const supabase = createMockSupabase({
      questions: [
        { id: 'q1', book_id: 'b1', session_id: null, type: 'grammar', prompt: '연습1', choices: ['A', 'B'], source_page: 3, created_at: '2026-08-01' },
      ],
      attempts: [
        { id: 'a1', question_id: 'q1', user_answer: 'B', is_correct: false, created_at: '2026-08-01T10:00:00Z' },
        { id: 'a2', question_id: 'q1', user_answer: 'A', is_correct: true, created_at: '2026-08-01T10:05:00Z' },
      ],
      books: [{ id: 'b1', name: '전공중국어 문법' }],
    });

    const notes = await getQuizPracticeNotes(supabase as any);

    expect(notes.map((n) => n.id)).toEqual(['a2', 'a1']);
  });
});
