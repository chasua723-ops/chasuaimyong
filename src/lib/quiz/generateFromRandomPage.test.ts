import { describe, it, expect, vi } from 'vitest';
import { generateFromRandomPage } from './generateFromRandomPage';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';
import { validateQuestion } from '../ai/validateQuestion';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn().mockResolvedValue([
    { type: 'grammar', sourcePage: 999, prompt: '다음 중 옳은 것은?', choices: ['A', 'B'], correctAnswer: 'A' },
  ]),
}));
vi.mock('../ai/validateQuestion', () => ({
  validateQuestion: vi.fn().mockResolvedValue({ valid: true, reason: 'ok' }),
}));

function baseTables(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    book_pages: [
      { book_id: 'b1', page_num: 1, content: '내용1' },
      { book_id: 'b1', page_num: 5, content: '내용5' },
      { book_id: 'b1', page_num: 10, content: '내용10' },
    ],
    reference_materials: [],
    ...overrides,
  };
}

describe('generateFromRandomPage', () => {
  it('overrides the AI-reported sourcePage with the actual page it was fed, ignoring hallucination', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(baseTables());

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.sourcePage).toBe(5); // the page actually fed in, not the mocked 999
    expect(result.prompt).toBe('다음 중 옳은 것은?');
    randomSpy.mockRestore();
  });

  it('fetches reference excerpts only when type is reading', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(
      baseTables({ reference_materials: [{ name: '독해 기출', content: '기출 내용' }] })
    );

    await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'reading',
    });

    const lastCall = vi.mocked(generateQuestions).mock.calls.at(-1)!;
    expect(lastCall[1].referenceExcerpts).toEqual(['기출 내용']);
    randomSpy.mockRestore();
  });

  it('does not fetch reference excerpts for non-reading types', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const supabase = createMockSupabase(
      baseTables({ reference_materials: [{ name: '독해 기출', content: '기출 내용' }] })
    );

    await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    const lastCall = vi.mocked(generateQuestions).mock.calls.at(-1)!;
    expect(lastCall[1].referenceExcerpts).toBeUndefined();
    randomSpy.mockRestore();
  });

  it('retries with a different page when the first random page has no content, then succeeds', async () => {
    const supabase = createMockSupabase(
      baseTables({ book_pages: [{ book_id: 'b1', page_num: 10, content: '내용10' }] })
    );
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1, missing from book_pages
    randomSpy.mockReturnValueOnce(0.95); // -> page 10, present

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.sourcePage).toBe(10);
    randomSpy.mockRestore();
  });

  it('retries on a different page when generateQuestions rejects (e.g. the page has no teachable content)', async () => {
    vi.mocked(generateQuestions)
      .mockRejectedValueOnce(new Error('Failed to parse JSON from Claude response: 이 내용으로는...'))
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 1, prompt: '재시도 성공 문제', choices: ['A', 'B'], correctAnswer: 'A' },
      ]);
    const supabase = createMockSupabase(baseTables());
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1 (rejects)
    randomSpy.mockReturnValueOnce(0.95); // -> page 10 (succeeds)

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.prompt).toBe('재시도 성공 문제');
    expect(result.sourcePage).toBe(10);
    randomSpy.mockRestore();
  });

  it('retries on a different page when the generated correctAnswer is not among its own choices', async () => {
    vi.mocked(generateQuestions)
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 1, prompt: '이상한 문제', choices: ['A', 'B'], correctAnswer: 'C' },
      ])
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 10, prompt: '재시도 성공 문제', choices: ['A', 'B'], correctAnswer: 'A' },
      ]);
    const supabase = createMockSupabase(baseTables());
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1 (bad correctAnswer)
    randomSpy.mockReturnValueOnce(0.95); // -> page 10 (succeeds)

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.prompt).toBe('재시도 성공 문제');
    randomSpy.mockRestore();
  });

  it('retries on a different page when validateQuestion judges the question invalid', async () => {
    vi.mocked(generateQuestions)
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 1, prompt: '목차 구성 방식으로 옳은 것은?', choices: ['A', 'B'], correctAnswer: 'A' },
      ])
      .mockResolvedValueOnce([
        { type: 'grammar', sourcePage: 10, prompt: '재시도 성공 문제', choices: ['A', 'B'], correctAnswer: 'A' },
      ]);
    vi.mocked(validateQuestion)
      .mockResolvedValueOnce({ valid: false, reason: '목차 구조를 묻는 문제입니다.' })
      .mockResolvedValueOnce({ valid: true, reason: 'ok' });
    const supabase = createMockSupabase(baseTables());
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.05); // -> page 1 (fails validation)
    randomSpy.mockReturnValueOnce(0.95); // -> page 10 (succeeds)

    const result = await generateFromRandomPage(supabase as any, {} as any, {
      bookId: 'b1',
      bookName: '전공중국어 문법',
      maxPage: 10,
      type: 'grammar',
    });

    expect(result.prompt).toBe('재시도 성공 문제');
    randomSpy.mockRestore();
  });

  it('throws after exhausting all attempts when every page is missing or every generation fails', async () => {
    const supabase = createMockSupabase(baseTables({ book_pages: [] }));

    await expect(
      generateFromRandomPage(supabase as any, {} as any, {
        bookId: 'b1',
        bookName: '전공중국어 문법',
        maxPage: 10,
        type: 'grammar',
      })
    ).rejects.toThrow('No page content found for question generation');
  });
});
