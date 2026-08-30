// src/app/search/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchPage from './page';

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

describe('SearchPage', () => {
  it('searches and shows the AI answer plus matched excerpts', async () => {
    mockFetch({
      'POST /api/search': () => ({
        ok: true,
        json: async () => ({
          answer: '把자문은 목적어를 동사 앞으로 이동시키는 구문입니다.',
          matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 원문 내용' }],
        }),
      }),
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(
      await screen.findByText(/把자문은 목적어를 동사 앞으로 이동시키는 구문입니다/)
    ).toBeInTheDocument();
    expect(screen.getByText(/문법 · 10페이지/)).toBeInTheDocument();
    expect(screen.getByText('把자문 원문 내용')).toBeInTheDocument();
  });

  it('shows an empty state for a turn with no matches', async () => {
    mockFetch({
      'POST /api/search': () => ({ ok: true, json: async () => ({ answer: '', matches: [] }) }),
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '존재하지않는단어');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText('검색 결과가 없어요.')).toBeInTheDocument();
  });

  it('lets the user ask a follow-up question that appends a second turn to the thread', async () => {
    mockFetch({
      'POST /api/search': [
        () => ({
          ok: true,
          json: async () => ({
            answer: '把자문 답변',
            matches: [{ bookId: 'b1', bookName: '문법', pageNum: 10, content: '把자문 내용' }],
          }),
        }),
        () => ({
          ok: true,
          json: async () => ({
            answer: '겸어문 후속 답변',
            matches: [{ bookId: 'b1', bookName: '문법', pageNum: 20, content: '겸어문 내용' }],
          }),
        }),
      ],
    });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await screen.findByText('把자문 답변');

    await user.type(screen.getByPlaceholderText('추가로 궁금한 걸 물어보세요'), '겸어문은?');
    await user.click(screen.getByRole('button', { name: '질문' }));

    expect(await screen.findByText('겸어문 후속 답변')).toBeInTheDocument();
    expect(screen.getByText('把자문 답변')).toBeInTheDocument();
  });

  it('shows an error message when the search request fails', async () => {
    mockFetch({ 'POST /api/search': () => ({ ok: false, status: 500 }) });

    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByPlaceholderText('검색어를 입력하세요'), '把자문');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText('검색하지 못했어요. 다시 시도해주세요.')).toBeInTheDocument();
  });
});
