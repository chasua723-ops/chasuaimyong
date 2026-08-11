import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EssayNotesPage from './page';

function mockFetch(handlers: Record<string, (() => any) | (() => any)[]>) {
  const callCounts: Record<string, number> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const key = init?.method === 'POST' ? `POST ${url}` : url;
      if (key in handlers) {
        const handler = handlers[key];
        if (Array.isArray(handler)) {
          const i = callCounts[key] ?? 0;
          callCounts[key] = i + 1;
          const fn = handler[Math.min(i, handler.length - 1)];
          return fn();
        }
        return handler();
      }
      throw new Error(`unhandled fetch: ${key}`);
    })
  );
}

const baseNotes = [
  {
    id: 'a1',
    questionPrompt: '鲁迅文学的特点是什么？',
    bookName: '문학개론',
    koreanDraft: '',
    chineseAnswer: '鲁迅用现实主义手法...',
    modelAnswer: '鲁迅文学的特点是深刻的现实主义批判精神。',
    conceptScore: 3,
    conceptChecklist: [
      { concept: '사실주의 기법', covered: true },
      { concept: '광인일기의 상징', covered: false },
      { concept: '봉건 사회 비판', covered: true },
      { concept: '백화문 사용', covered: true },
    ],
    grammarCorrections: [],
    createdAt: '2026-08-01T00:00:00Z',
  },
];

describe('Essay notes page', () => {
  beforeEach(() => {
    mockFetch({
      '/api/essay-notes': () => ({
        ok: true,
        json: async () => ({ notes: baseNotes, books: [{ id: 'b1', name: '문학개론' }] }),
      }),
      'POST /api/essay-notes/new': () => ({
        ok: true,
        json: async () => ({ id: 'q-new', prompt: '这篇课文的主题是什么？', sourcePage: 12 }),
      }),
      'POST /api/attempts/essay': () => ({
        ok: true,
        json: async () => ({
          conceptScore: 4,
          conceptChecklist: [
            { concept: 'A', covered: true },
            { concept: 'B', covered: true },
            { concept: 'C', covered: true },
            { concept: 'D', covered: true },
          ],
          grammarCorrections: [],
        }),
      }),
    });
  });

  it('renders past essay attempts with their concept checklist and score', async () => {
    render(<EssayNotesPage />);

    expect(await screen.findByText(/鲁迅文学的特点是什么/)).toBeInTheDocument();
    expect(screen.getByText('3/4점')).toBeInTheDocument();
    expect(screen.getByText(/사실주의 기법/)).toBeInTheDocument();
  });

  it("shows the user's own answer alongside the model answer for a past attempt", async () => {
    render(<EssayNotesPage />);

    await screen.findByText(/鲁迅文学的特点是什么/);

    expect(screen.getByText('내가 쓴 답안')).toBeInTheDocument();
    expect(screen.getByText(/鲁迅用现实主义手法/)).toBeInTheDocument();
    expect(screen.getByText('모범답안')).toBeInTheDocument();
    expect(screen.getByText(/深刻的现实主义批判精神/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no past attempts', async () => {
    mockFetch({
      '/api/essay-notes': () => ({
        ok: true,
        json: async () => ({ notes: [], books: [{ id: 'b1', name: '문학개론' }] }),
      }),
    });

    render(<EssayNotesPage />);

    expect(await screen.findByText('아직 제출한 서술형 답안이 없어요.')).toBeInTheDocument();
  });

  it('lets the user pick a book, generates a new question, and submits it for grading', async () => {
    render(<EssayNotesPage />);
    await screen.findByText(/鲁迅文学的特点是什么/);

    const user = userEvent.setup();
    await user.click(screen.getByText('새 문제 풀기'));
    await user.click(await screen.findByRole('button', { name: '문학개론' }));

    expect(await screen.findByText(/这篇课文的主题是什么/)).toBeInTheDocument();

    const koreanBox = screen.getByLabelText(/1단계/);
    const chineseBox = screen.getByLabelText(/2단계/);
    await user.type(koreanBox, '내용 요약');
    await user.type(chineseBox, '答案内容');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText('4/4점')).toBeInTheDocument());
  });

  it('shows an error message when the essay notes request fails', async () => {
    mockFetch({
      '/api/essay-notes': () => ({ ok: false, status: 500 }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<EssayNotesPage />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('shows a Korean error message when generating a new question fails, without rendering a broken question', async () => {
    mockFetch({
      '/api/essay-notes': () => ({
        ok: true,
        json: async () => ({ notes: baseNotes, books: [{ id: 'b1', name: '문학개론' }] }),
      }),
      'POST /api/essay-notes/new': () => ({ ok: false, status: 500 }),
    });

    render(<EssayNotesPage />);
    await screen.findByText(/鲁迅文学的特点是什么/);

    const user = userEvent.setup();
    await user.click(screen.getByText('새 문제 풀기'));
    await user.click(await screen.findByRole('button', { name: '문학개론' }));

    expect(
      await screen.findByText('새 문제를 만들지 못했어요. 다시 시도해주세요.')
    ).toBeInTheDocument();
    expect(screen.queryByText('제출')).not.toBeInTheDocument();
  });

  it('lets the user start another practice question after successfully submitting one', async () => {
    render(<EssayNotesPage />);
    await screen.findByText(/鲁迅文学的特点是什么/);

    const user = userEvent.setup();
    await user.click(screen.getByText('새 문제 풀기'));
    await user.click(await screen.findByRole('button', { name: '문학개론' }));
    await screen.findByText(/这篇课文的主题是什么/);

    const koreanBox = screen.getByLabelText(/1단계/);
    const chineseBox = screen.getByLabelText(/2단계/);
    await user.type(koreanBox, '내용 요약');
    await user.type(chineseBox, '答案内容');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText('4/4점')).toBeInTheDocument());

    await user.click(screen.getByText('새 문제 더 풀기'));

    expect(screen.queryByText(/这篇课文的主题是什么/)).not.toBeInTheDocument();
    expect(screen.getByText('새 문제 풀기')).toBeInTheDocument();
  });

  it('keeps the just-graded feedback and the existing notes list visible when the post-submit refetch fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({
      '/api/essay-notes': [
        () => ({
          ok: true,
          json: async () => ({ notes: baseNotes, books: [{ id: 'b1', name: '문학개론' }] }),
        }),
        () => ({ ok: false, status: 500 }),
      ],
      'POST /api/essay-notes/new': () => ({
        ok: true,
        json: async () => ({ id: 'q-new', prompt: '这篇课文的主题是什么？', sourcePage: 12 }),
      }),
      'POST /api/attempts/essay': () => ({
        ok: true,
        json: async () => ({
          conceptScore: 4,
          conceptChecklist: [
            { concept: 'A', covered: true },
            { concept: 'B', covered: true },
            { concept: 'C', covered: true },
            { concept: 'D', covered: true },
          ],
          grammarCorrections: [],
        }),
      }),
    });

    render(<EssayNotesPage />);
    await screen.findByText(/鲁迅文学的特点是什么/);

    const user = userEvent.setup();
    await user.click(screen.getByText('새 문제 풀기'));
    await user.click(await screen.findByRole('button', { name: '문학개론' }));
    await screen.findByText(/这篇课文的主题是什么/);

    const koreanBox = screen.getByLabelText(/1단계/);
    const chineseBox = screen.getByLabelText(/2단계/);
    await user.type(koreanBox, '내용 요약');
    await user.type(chineseBox, '答案内容');
    await user.click(screen.getByText('제출'));

    // The refetch after grading fails, but the grade we just received must
    // stay visible and the page must not fall back to a loading/blank state.
    await waitFor(() => expect(screen.getByText('4/4점')).toBeInTheDocument());
    expect(screen.getByText(/鲁迅文学的特点是什么/)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
