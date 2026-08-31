import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSearch } from './runSearch';
import { searchBookPages } from './searchBookPages';
import { answerSearchQuery } from '../ai/answerSearchQuery';

vi.mock('./searchBookPages', () => ({ searchBookPages: vi.fn() }));
vi.mock('../ai/answerSearchQuery', () => ({ answerSearchQuery: vi.fn() }));

describe('runSearch', () => {
  beforeEach(() => {
    vi.mocked(searchBookPages).mockClear();
    vi.mocked(answerSearchQuery).mockClear();
  });

  it('searches, then answers using the matches, and returns both', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([
      { bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' },
    ]);
    vi.mocked(answerSearchQuery).mockResolvedValue('요약 답변');

    const result = await runSearch({} as any, {} as any, { query: '把자문' });

    expect(result).toEqual({
      answer: '요약 답변',
      matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' }],
    });
    expect(vi.mocked(answerSearchQuery)).toHaveBeenCalledWith(
      {},
      {
        query: '把자문',
        excerpts: [{ bookName: '문법', pageNum: 10, content: '把자문 내용' }],
        history: undefined,
      }
    );
  });

  it('does not call the AI when there are zero matches', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([]);

    const result = await runSearch({} as any, {} as any, { query: '없는단어' });

    expect(result).toEqual({ answer: '', matches: [] });
    expect(vi.mocked(answerSearchQuery)).not.toHaveBeenCalled();
  });

  it('caps the excerpts fed to the AI at 10, even with more matches', async () => {
    const manyMatches = Array.from({ length: 15 }, (_, i) => ({
      bookId: 'b1',
      bookName: '문법',
      pageNum: i + 1,
      content: `내용 ${i + 1}`,
    }));
    vi.mocked(searchBookPages).mockResolvedValue(manyMatches);
    vi.mocked(answerSearchQuery).mockResolvedValue('답변');

    await runSearch({} as any, {} as any, { query: '검색어' });

    const call = vi.mocked(answerSearchQuery).mock.calls[0][1];
    expect(call.excerpts).toHaveLength(10);
  });

  it('passes history through to answerSearchQuery', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([
      { bookId: 'b1', bookName: '문법', pageNum: 5, content: '내용' },
    ]);
    vi.mocked(answerSearchQuery).mockResolvedValue('후속 답변');

    await runSearch({} as any, {} as any, {
      query: '후속질문',
      history: [{ question: '이전질문', answer: '이전답변' }],
    });

    const call = vi.mocked(answerSearchQuery).mock.calls[0][1];
    expect(call.history).toEqual([{ question: '이전질문', answer: '이전답변' }]);
  });

  it('caps history at the most recent 5 turns, even when more are passed in', async () => {
    vi.mocked(searchBookPages).mockResolvedValue([
      { bookId: 'b1', bookName: '문법', pageNum: 5, content: '내용' },
    ]);
    vi.mocked(answerSearchQuery).mockResolvedValue('답변');

    const manyTurns = Array.from({ length: 8 }, (_, i) => ({
      question: `질문${i + 1}`,
      answer: `답변${i + 1}`,
    }));

    await runSearch({} as any, {} as any, { query: '검색어', history: manyTurns });

    const call = vi.mocked(answerSearchQuery).mock.calls[0][1];
    expect(call.history).toEqual(manyTurns.slice(-5));
    expect(call.history).toHaveLength(5);
  });
});
