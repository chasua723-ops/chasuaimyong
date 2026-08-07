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
    // 0.05 -> Math.floor(0.05 * 10) + 1 = page 1, which is present in book_pages.
    // This deliberately differs from the AI's mocked sourcePage of 5, so the
    // assertion below proves the inserted source_page comes from the page we
    // actually fetched/sent to generateQuestions, not the AI's echoed value.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const supabase = createMockSupabase(baseTables());

    const result = await generateEssayPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('这篇课文的主题是什么？');
    expect(supabase.inserted.questions[0]).toMatchObject({
      book_id: 'b1',
      session_id: null,
      type: 'essay',
    });
    expect(supabase.inserted.questions[0].source_page).toBe(1);
    expect(result.sourcePage).toBe(1);
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
    // The AI's mocked response claims sourcePage: 5, but the page actually
    // fetched and passed to generateQuestions was page 10 (after the retry).
    // The inserted source_page must reflect the real fetched page, not the
    // AI's echoed value, so that the later book_pages lookup never misses.
    expect(supabase.inserted.questions[0].source_page).toBe(10);
    expect(result.sourcePage).toBe(10);
    randomSpy.mockRestore();
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateEssayPractice(supabase as any, {} as any, { bookId: 'missing' })
    ).rejects.toThrow('Book not found');
  });
});
