import { describe, it, expect, vi } from 'vitest';
import { generateEssayPractice } from './generateEssayPractice';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn().mockResolvedValue([
    { type: 'essay', sourcePage: 5, prompt: '这篇课文的主题是什么？', correctAnswer: '' },
  ]),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 10 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '내용1' },
      { book_id: 'b1', page_num: 5, content: '내용5' },
      { book_id: 'b1', page_num: 10, content: '내용10' },
    ],
    questions: [],
    ...overrides,
  };
}

describe('generateEssayPractice', () => {
  it('generates a new essay question from a page within the read range and stores it with no session', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateEssayPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('这篇课文的主题是什么？');
    expect(supabase.inserted.questions[0]).toMatchObject({
      book_id: 'b1',
      session_id: null,
      type: 'essay',
    });
    randomSpy.mockRestore();
  });

  it('retries with a different page when the first random page has no content, then succeeds', async () => {
    const supabase = createMockSupabase(
      baseTables({ book_pages: [{ book_id: 'b1', page_num: 10, content: '내용10' }] })
    );
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1, missing from book_pages
    randomSpy.mockReturnValueOnce(0.95); // -> page 10, present

    const result = await generateEssayPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('这篇课文的主题是什么？');
    randomSpy.mockRestore();
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateEssayPractice(supabase as any, {} as any, { bookId: 'missing' })
    ).rejects.toThrow('Book not found');
  });
});
