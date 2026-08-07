import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleDailySession } from './assembleDailySession';
import { createMockSupabase } from '../../../tests/helpers/mockSupabase';
import { generateQuestions } from '../ai/generateQuestions';
import { curateVocab } from '../ai/curateVocab';

vi.mock('../ai/generateQuestions', () => ({
  generateQuestions: vi.fn(async (_client: any, input: any) => {
    if (input.types.includes('essay')) {
      return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
    }
    return [{ type: 'grammar', sourcePage: 3, prompt: 'q', correctAnswer: 'a' }];
  }),
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
  // The fixture book's pacing yields endPage 3 for 2026-08-03 (see calculateDailyRange).
  // Quiz questions are now sourced from a random page across [1, endPage], so every page in
  // that range needs a row here or the random draw can miss and (correctly) retry/fail.
  book_pages: [
    { book_id: 'b1', page_num: 1, content: '내용1' },
    { book_id: 'b1', page_num: 2, content: '내용2' },
    { book_id: 'b1', page_num: 3, content: '내용3' },
  ],
  reference_materials: [],
  vocab_of_the_day: [],
};

describe('assembleDailySession', () => {
  beforeEach(() => {
    vi.mocked(generateQuestions).mockClear();
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

  it('ignores a hallucinated quiz sourcePage and always records the actual page the question was generated from', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(generateQuestions).mockImplementation(async (_client: any, input: any) => {
      if (input.types.includes('essay')) {
        return [{ type: 'essay', sourcePage: 3, prompt: '서술형 문제', correctAnswer: '모범답안' }];
      }
      // Claude claims page 999, which is nowhere near the fed page.
      return [{ type: input.types[0], sourcePage: 999, prompt: 'q', correctAnswer: 'a' }];
    });

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const quizQuestions = supabase.inserted.questions.filter((q: any) => q.type !== 'essay');
    for (const q of quizQuestions) {
      expect(q.source_page).toBeGreaterThanOrEqual(1);
      expect(q.source_page).toBeLessThanOrEqual(3);
      expect(q.source_page).not.toBe(999);
    }
  });

  it('inserts no daily_sessions row when question generation fails, so the day can be retried', async () => {
    const supabase = createMockSupabase(baseTables);
    // generateFromRandomPage retries up to 3 times on failure, so a single rejection
    // wouldn't propagate — reject all 3 attempts (queued, not persistent, so it doesn't leak
    // into later tests) to exercise "generation is unrecoverable, so no session gets inserted".
    vi.mocked(generateQuestions)
      .mockRejectedValueOnce(new Error('Claude blew up'))
      .mockRejectedValueOnce(new Error('Claude blew up'))
      .mockRejectedValueOnce(new Error('Claude blew up'));

    await expect(
      assembleDailySession(supabase as any, {} as any, '2026-08-03')
    ).rejects.toThrow('Claude blew up');

    expect(supabase.inserted.daily_sessions).toBeUndefined();
    expect(supabase.inserted.questions).toBeUndefined();
    expect(supabase.inserted.vocab_of_the_day).toBeUndefined();
  });

  it('inserts no daily_sessions row when vocab curation fails', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(curateVocab).mockRejectedValueOnce(new Error('vocab blew up'));

    await expect(
      assembleDailySession(supabase as any, {} as any, '2026-08-03')
    ).rejects.toThrow('vocab blew up');

    expect(supabase.inserted.daily_sessions).toBeUndefined();
    expect(supabase.inserted.questions).toBeUndefined();
  });

  it('adds exactly one essay question, and only for the book assigned to today\'s essay slot', async () => {
    const supabase = createMockSupabase(baseTables);

    await assembleDailySession(supabase as any, {} as any, '2026-08-03');

    const essayQuestions = supabase.inserted.questions.filter((q: any) => q.type === 'essay');
    expect(essayQuestions).toHaveLength(1);
    expect(essayQuestions[0].book_id).toBe('b1');
  });
});
