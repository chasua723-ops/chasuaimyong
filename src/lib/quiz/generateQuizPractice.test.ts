import { describe, it, expect, vi } from 'vitest';
import { generateQuizPractice } from './generateQuizPractice';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn().mockResolvedValue([
    { type: 'grammar', sourcePage: 5, prompt: '다음 중 옳은 것은?', choices: ['A', 'B'], correctAnswer: 'A' },
  ]),
}));
vi.mock('../ai/validateQuestion', () => ({
  validateQuestion: vi.fn().mockResolvedValue({ valid: true, reason: 'ok' }),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    books: [{ id: 'b1', name: '전공중국어 문법', current_page: 10 }],
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '내용1' },
      { book_id: 'b1', page_num: 5, content: '내용5' },
      { book_id: 'b1', page_num: 10, content: '내용10' },
    ],
    category_stats: [],
    reference_materials: [],
    questions: [],
    ...overrides,
  };
}

describe('generateQuizPractice', () => {
  it('generates a new quiz question from a page within the read range and stores it with no session', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('다음 중 옳은 것은?');
    expect(result.choices).toEqual(['A', 'B']);
    expect(supabase.inserted.questions[0]).toMatchObject({
      book_id: 'b1',
      session_id: null,
    });
    randomSpy.mockRestore();
  });

  it('picks a type from QUIZ_TYPES via the adaptive weights', async () => {
    // Only 3 of 10 pages in baseTables() have book_pages rows, so leaving Math.random
    // unmocked here would make the 2-attempt page-retry loop flaky (~49% chance both
    // attempts miss). Force both draws onto page 5, which exists.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(['grammar', 'vocab', 'reading', 'theory']).toContain(result.type);
    randomSpy.mockRestore();
  });

  it('retries with a different page when the first random page has no content, then succeeds', async () => {
    // generateQuizPractice draws Math.random in this order: (1) type pick via
    // pickWeightedTypes, (2) page pick per attempt. category_stats is [] here so all four
    // types carry the default 0.5 weight — the exact type picked doesn't matter for this test,
    // only that the mock sequence accounts for that first draw before the page draws.
    const supabase = createMockSupabase(
      baseTables({ book_pages: [{ book_id: 'b1', page_num: 10, content: '내용10' }] })
    );
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.9); // type pick (uniform weights, any value works)
    randomSpy.mockReturnValueOnce(0.05); // -> page 1, missing from book_pages
    randomSpy.mockReturnValueOnce(0.95); // -> page 10, present

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('다음 중 옳은 것은?');
    randomSpy.mockRestore();
  });

  it('fetches reference excerpts when the picked type is reading', async () => {
    vi.mocked(generateQuestions).mockResolvedValueOnce([
      { type: 'reading', sourcePage: 5, prompt: '독해 문제', correctAnswer: '정답' },
    ]);
    const supabase = createMockSupabase(
      baseTables({
        category_stats: [
          { type: 'grammar', correct_count: 10, total_count: 10 },
          { type: 'vocab', correct_count: 10, total_count: 10 },
          { type: 'theory', correct_count: 10, total_count: 10 },
          { type: 'reading', correct_count: 0, total_count: 10 },
        ],
        reference_materials: [{ name: '독해 기출', content: '기출 내용' }],
      })
    );
    // With those stats: grammar/vocab/theory each get the 0.1 floor weight, reading gets 1.0
    // (entries iterate in QUIZ_TYPES order — grammar, vocab, reading, theory; totalWeight 1.3).
    // rng()=0.5 -> r=0.65, which lands past grammar+vocab (0.2) and within reading's span
    // (0.2, 1.2] -> deterministically picks reading. Second draw (0.4) picks page 5, which
    // exists in baseTables()'s default book_pages, so no retry is needed.
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.5); // type pick -> reading
    randomSpy.mockReturnValueOnce(0.4); // page pick -> page 5 (exists)

    await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    const lastCall = vi.mocked(generateQuestions).mock.calls.at(-1)!;
    expect(lastCall[1].referenceExcerpts).toEqual(['기출 내용']);
    randomSpy.mockRestore();
  });

  it('throws when the book is not found', async () => {
    const supabase = createMockSupabase(baseTables({ books: [] }));

    await expect(
      generateQuizPractice(supabase as any, {} as any, { bookId: 'missing' })
    ).rejects.toThrow('Book not found');
  });

  it('retries on a different page when generateQuestions rejects (e.g. the page has no teachable content)', async () => {
    // Reproduces a real failure: a random page landed on front matter (copyright/ISBN info)
    // and Claude declined with prose instead of JSON, which generateQuestions surfaces as a
    // thrown error rather than a missing book_pages row.
    vi.mocked(generateQuestions)
      .mockRejectedValueOnce(new Error('Failed to parse JSON from Claude response: 이 내용으로는...'))
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 5, prompt: '재시도 성공 문제', choices: ['A', 'B'], correctAnswer: 'A' },
      ]);
    const supabase = createMockSupabase(baseTables());
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.9); // type pick
    randomSpy.mockReturnValueOnce(0.05); // -> page 1 (front matter, generateQuestions rejects)
    randomSpy.mockReturnValueOnce(0.95); // -> page 10 (succeeds)

    const result = await generateQuizPractice(supabase as any, {} as any, { bookId: 'b1' });

    expect(result.prompt).toBe('재시도 성공 문제');
    randomSpy.mockRestore();
  });
});
