// src/app/study/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyPage from './page';

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

const books = [{ id: 'b1', name: '문법' }];
const topics = [
  { id: 'p1', book_id: 'b1', parent_id: null, name: '1장 품사론', start_page: 1, end_page: 20 },
  { id: 'c1', book_id: 'b1', parent_id: 'p1', name: '1절 수사', start_page: 1, end_page: 10 },
];

beforeEach(() => {
  localStorage.clear();
  mockFetch({
    '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
    '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics }) }),
    '/api/study/c1': () => ({
      ok: true,
      json: async () => ({
        topic: { id: 'c1', name: '1절 수사', startPage: 1, endPage: 10 },
        content: '수사는 명사 앞에 온다',
        explanation: null,
      }),
    }),
    'POST /api/study/c1/explain': () => ({
      ok: true,
      json: async () => ({ explanation: '수사 해설입니다' }),
    }),
    'POST /api/study/c1/practice': () => ({
      ok: true,
      json: async () => ({ id: 'q1', type: 'grammar', prompt: '수사 문제', choices: ['A', 'B'], sourcePage: 5 }),
    }),
    'POST /api/attempts': () => ({ ok: true, json: async () => ({ isCorrect: true }) }),
  });
});

describe('StudyPage', () => {
  it('shows books, then topics after picking a book, then content after picking a topic', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');

    expect(await screen.findByText('수사는 명사 앞에 온다')).toBeInTheDocument();
  });

  it('shows a "해설 보기" button when no explanation is cached, and shows the explanation after clicking it', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('해설 보기'));

    expect(await screen.findByText('수사 해설입니다')).toBeInTheDocument();
  });

  it('generates and answers a practice question scoped to the selected topic', async () => {
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('연습문제 풀기'));
    await screen.findByText(/수사 문제/);

    await user.click(screen.getByText('A'));

    await waitFor(() => expect(screen.getByText('정답입니다')).toBeInTheDocument());
  });

  it('shows a hint instead of a dropdown when the selected book has no topics yet', async () => {
    mockFetch({
      '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
      '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics: [] }) }),
    });
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));

    expect(await screen.findByText('아직 학습 콘텐츠가 준비되지 않았어요.')).toBeInTheDocument();
  });

  it('shows an error message when generating a practice question fails', async () => {
    mockFetch({
      '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
      '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics }) }),
      '/api/study/c1': () => ({
        ok: true,
        json: async () => ({
          topic: { id: 'c1', name: '1절 수사', startPage: 1, endPage: 10 },
          content: '수사는 명사 앞에 온다',
          explanation: null,
        }),
      }),
      'POST /api/study/c1/practice': () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('연습문제 풀기'));

    expect(
      await screen.findByText('연습문제를 만들지 못했어요. 다시 시도해주세요.')
    ).toBeInTheDocument();
  });

  it('shows an error message instead of false feedback when grading a practice answer fails', async () => {
    mockFetch({
      '/api/books': () => ({ ok: true, json: async () => ({ books }) }),
      '/api/topics?bookId=b1': () => ({ ok: true, json: async () => ({ topics }) }),
      '/api/study/c1': () => ({
        ok: true,
        json: async () => ({
          topic: { id: 'c1', name: '1절 수사', startPage: 1, endPage: 10 },
          content: '수사는 명사 앞에 온다',
          explanation: null,
        }),
      }),
      'POST /api/study/c1/practice': () => ({
        ok: true,
        json: async () => ({ id: 'q1', type: 'grammar', prompt: '수사 문제', choices: ['A', 'B'], sourcePage: 5 }),
      }),
      'POST /api/attempts': () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const user = userEvent.setup();
    render(<StudyPage />);

    await user.click(await screen.findByText('문법'));
    await user.selectOptions(await screen.findByLabelText('주제 선택'), 'c1');
    await screen.findByText('수사는 명사 앞에 온다');

    await user.click(screen.getByText('연습문제 풀기'));
    await screen.findByText(/수사 문제/);

    await user.click(screen.getByText('A'));

    expect(await screen.findByText('채점하지 못했어요. 다시 시도해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('정답입니다')).not.toBeInTheDocument();
  });
});
