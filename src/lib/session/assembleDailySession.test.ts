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
  book_pages: [{ book_id: 'b1', page_num: 1, content: '내용1' }],
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

  it('inserts no daily_sessions row when question generation fails, so the day can be retried', async () => {
    const supabase = createMockSupabase(baseTables);
    vi.mocked(generateQuestions).mockRejectedValueOnce(new Error('Claude blew up'));

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
