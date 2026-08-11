import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleDailySession, buildQuizGenerationRequests, createLimiter, shuffle } from './assembleDailySession';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions, type GeneratedQuestion, type QuestionGenInput } from '../ai/generateQuestions';
import { curateVocab } from '../ai/curateVocab';

async function defaultGenerateQuestionsImpl(
  _client: any,
  input: QuestionGenInput
): Promise<GeneratedQuestion[]> {
  if (input.types.includes('essay')) {
    return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
  }
  return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
}

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn(defaultGenerateQuestionsImpl),
}));
vi.mock('../ai/validateQuestion', () => ({
  validateQuestion: vi.fn().mockResolvedValue({ valid: true, reason: 'ok' }),
}));
vi.mock('../ai/curateVocab', () => ({
  curateVocab: vi.fn().mockResolvedValue({
    wordZh: '内卷',
    pinyin: 'nèijuǎn',
    meaningKo: '내권',
    exampleZh: '例句',
    exampleKo: '예문',
  }),
}));

const baseTables = {
  daily_sessions: [],
  books: [
    {
      id: 'b1',
      name: '문법',
      total_pages: 100,
      exam_date: '2026-12-01',
      target_read_count: 3,
      current_read_count: 1,
      current_page: 1,
    },
  ],
  category_stats: [],
  // The fixture book's pacing yields startPage 1 / endPage 3 for 2026-08-03 (see
  // calculateDailyRange). Progress-group quiz questions draw from [startPage, endPage]; every
  // page in that range needs a row here or the random draw can miss and (correctly)
  // retry/fail. Review-group questions draw from [1, total_pages] (100) via a bounded random
  // FALLBACK_WINDOW_PAGES-page window as a last resort (see generateFromRandomPage), so —
  // unlike before that window was bounded — content needs to be available wherever that
  // window happens to land, not just at a few known pages. Real OCR'd books have full page
  // coverage, so the fixture mirrors that instead of staying artificially sparse.
  book_pages: Array.from({ length: 100 }, (_, i) => ({
    book_id: 'b1',
    page_num: i + 1,
    content: `내용${i + 1}`,
  })),
  reference_materials: [],
  vocab_of_the_day: [],
};

describe('assembleDailySession', () => {
  beforeEach(() => {
    // mockReset + reinstate, not just mockClear: a test earlier in this file may have
    // installed a persistent override (e.g. mockRejectedValue) to reliably fail every
    // concurrent call under Promise.all — mockClear alone would leave that override in
    // place and leak into later tests that expect the default success behavior.
    vi.mocked(generateQuestions).mockReset().mockImplementation(defaultGenerateQuestionsImpl);
    vi.mocked(curateVocab).mockClear();
  });

  it('returns the existing session and performs no side effects when one already exists for today', async () => {
    const existingSession = { id: 's1', date: '2026-08-03', essay_book_id: 'b1', completed: false };
    const supabase = createMockSupabase({
      ...baseTables,
      daily_sessions: [existingSession],
    });

    const session = await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(session).toEqual(existingSession);
    expect(supabase.inserted.questions).toBeUndefined();
    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
    expect(supabase.inserted.daily_sessions).toBeUndefined();
    expect(generateQuestions).not.toHaveBeenCalled();
    expect(curateVocab).not.toHaveBeenCalled();
  });

  it('creates a session, generates questions per book, and curates vocab when missing', async () => {
    const supabase = createMockSupabase(baseTables);

    const session = await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(session).toBeTruthy();
    expect(supabase.inserted.questions?.length).toBeGreaterThan(0);
    expect(supabase.inserted.vocab_of_the_day?.length).toBe(1);
  });

  it('does not regenerate vocab if already present for today', async () => {
    const supabase = createMockSupabase({
      ...baseTables,
      vocab_of_the_day: [{ date: '2026-08-03', word_zh: '既有' }],
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
  });

  it('clamps an out-of-range essay sourcePage from Claude into the day\'s assigned page range', async () => {
    const supabase = createMockSupabase(baseTables);
    // The mock book's pacing yields pages 1~3 for 2026-08-03. Quiz sourcePage no longer needs
    // clamping (see the next test) — this now only exercises the essay path, which still
    // trusts Claude's self-reported sourcePage across a multi-page excerpt.
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 0, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const essay = supabase.inserted.questions.find((q: any) => q.type === 'essay');
    expect(essay.source_page).toBe(1);
  });

  it('ignores a hallucinated quiz sourcePage and always records a page within the requested range', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      // Claude claims page 999, which is nowhere near any page it was actually fed.
      return [{ type: input.types[0], sourcePage: 999, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    // Progress-group questions are bounded to [1, 3] (today's range); review-group questions
    // are bounded to [1, 100] (book.total_pages) and can legitimately land beyond page 3.
    const quizQuestions = supabase.inserted.questions.filter((q: any) => q.type !== 'essay');
    expect(quizQuestions).toHaveLength(10);
    for (const q of quizQuestions) {
      expect(q.source_page).toBeGreaterThanOrEqual(1);
      expect(q.source_page).toBeLessThanOrEqual(100);
      expect(q.source_page).not.toBe(999);
    }
  });

  it('inserts no daily_sessions row when every question generation attempt fails, so the day can be retried', async () => {
    const supabase = createMockSupabase(baseTables);
    // Individual question/essay failures are now caught and skipped (see the tests below) —
    // this test exercises the floor: when literally nothing could be generated (every quiz
    // question and the essay all fail, for every book), that's not bad luck on one piece of
    // content, it's systemic, and assembleDailySession refuses to persist an empty session.
    vi.mocked(generateQuestions).mockRejectedValue(new Error('Claude blew up'));

    await expect(
      assembleDailySession(supabase as any, {} as any, '2026-08-03')
    ).rejects.toThrow('All question generation failed');

    expect(supabase.inserted.daily_sessions).toBeUndefined();
    expect(supabase.inserted.questions).toBeUndefined();
    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
  });

  it('still creates the session when vocab curation fails, just without a vocab card', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(curateVocab).mockRejectedValueOnce(new Error('vocab blew up'));

    const session = await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(session).toBeTruthy();
    expect(supabase.inserted.questions?.length).toBeGreaterThan(0);
    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
  });

  it("skips a book whose quiz/essay generation fails entirely, but still creates a session from the other books' questions", async () => {
    const failingBook = baseTables.books[0]; // '문법', id 'b1'
    const okBook = {
      id: 'b2',
      name: '문학개론',
      total_pages: 100,
      exam_date: '2026-12-01',
      target_read_count: 3,
      current_read_count: 1,
      current_page: 1,
    };
    const supabase = createMockSupabase({
      ...baseTables,
      books: [failingBook, okBook],
      book_pages: [
        ...baseTables.book_pages,
        ...Array.from({ length: 100 }, (_, i) => ({ book_id: 'b2', page_num: i + 1, content: `내용${i + 1}` })),
      ],
    });
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.bookName === failingBook.name) {
        throw new Error('Claude blew up for this book only');
      }
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
    });

    const session = await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(session).toBeTruthy();
    const questionsForFailingBook = supabase.inserted.questions.filter((q: any) => q.book_id === 'b1');
    const questionsForOkBook = supabase.inserted.questions.filter((q: any) => q.book_id === 'b2');
    expect(questionsForFailingBook).toHaveLength(0);
    expect(questionsForOkBook.length).toBeGreaterThan(0);
  });

  it('adds exactly one essay question, and only for the book assigned to today\'s essay slot', async () => {
    const supabase = createMockSupabase(baseTables);

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const essayQuestions = supabase.inserted.questions.filter((q: any) => q.type === 'essay');
    expect(essayQuestions).toHaveLength(1);
    expect(essayQuestions[0].book_id).toBe('b1');
  });

  it('retries essay generation after a transient failure (e.g. malformed JSON) instead of failing the whole session', async () => {
    const supabase = createMockSupabase(baseTables);
    let essayAttempts = 0;
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        essayAttempts++;
        if (essayAttempts === 1) {
          throw new Error('Failed to parse JSON from Claude response: {"type":"essay"...');
        }
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    expect(essayAttempts).toBeGreaterThanOrEqual(2);
    const essayQuestions = supabase.inserted.questions.filter((q: any) => q.type === 'essay');
    expect(essayQuestions).toHaveLength(1);
  });
});

describe('shuffle', () => {
  it('reorders elements using the provided rng instead of preserving insertion order', () => {
    const input = [1, 2, 3, 4, 5];
    const rngValues = [0.9, 0.1, 0.9, 0.1];
    let i = 0;
    const rng = () => rngValues[i++];

    const result = shuffle(input, rng);

    expect(result).not.toEqual(input);
    expect([...result].sort()).toEqual(input);
  });
});

describe('buildQuizGenerationRequests', () => {
  it('splits into 5 requests bounded to the daily range and 5 bounded to the whole book', () => {
    const book = { total_pages: 100 };
    const range = { startPage: 10, endPage: 15 };
    const quizWeights = { grammar: 1, vocab: 1, reading: 1, theory: 1 } as any;

    const requests = buildQuizGenerationRequests(book, range, quizWeights);

    expect(requests).toHaveLength(10);
    const progressRequests = requests.filter((r) => r.minPage === 10 && r.maxPage === 15);
    const reviewRequests = requests.filter((r) => r.maxPage === 100 && r.minPage === undefined);
    expect(progressRequests).toHaveLength(5);
    expect(reviewRequests).toHaveLength(5);
  });

  it('caps the progress-group count to the width of a narrow daily range and reallocates the rest to review', () => {
    const book = { total_pages: 100 };
    const range = { startPage: 10, endPage: 12 }; // width 3
    const quizWeights = { grammar: 1, vocab: 1, reading: 1, theory: 1 } as any;

    const requests = buildQuizGenerationRequests(book, range, quizWeights);

    expect(requests).toHaveLength(10);
    const progressRequests = requests.filter((r) => r.minPage === 10 && r.maxPage === 12);
    const reviewRequests = requests.filter((r) => r.maxPage === 100 && r.minPage === undefined);
    expect(progressRequests).toHaveLength(3);
    expect(reviewRequests).toHaveLength(7);
  });
});

describe('createLimiter', () => {
  it('never runs more than maxConcurrent tasks at once', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const resolvers: (() => void)[] = [];

    const task = () =>
      limit(
        () =>
          new Promise<void>((resolve) => {
            active++;
            peak = Math.max(peak, active);
            resolvers.push(() => {
              active--;
              resolve();
            });
          })
      );

    const tasks = Array.from({ length: 10 }, () => task());

    // Let the microtask queue settle so every task has had a chance to either start or queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBeLessThanOrEqual(3);
    expect(active).toBe(3);

    // Resolve queued tasks a few at a time and keep asserting the cap holds throughout.
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
      expect(peak).toBeLessThanOrEqual(3);
    }

    await Promise.all(tasks);
    expect(active).toBe(0);
  });
});
