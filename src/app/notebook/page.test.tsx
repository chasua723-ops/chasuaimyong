import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotebookPage from './page';

function mockFetch(handlers: Record<string, () => any>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const key = init?.method === 'POST' ? `POST ${url}` : url;
      if (key in handlers) return handlers[key]();
      throw new Error(`unhandled fetch: ${key}`);
    })
  );
}

describe('Notebook page', () => {
  beforeEach(() => {
    mockFetch({
      '/api/notebook': () => ({
        ok: true,
        json: async () => ({
          groups: [
            {
              type: 'reading',
              label: '독해',
              outstandingCount: 1,
              totalCount: 2,
              questions: [
                {
                  id: 'q1',
                  prompt: '이 글의 주제로 가장 적절한 것은?',
                  choices: ['A', 'B'],
                  sourcePage: 57,
                  bookName: '독해편기출문제2',
                  overcome: false,
                  attemptCount: 1,
                },
                {
                  id: 'q2',
                  prompt: '밑줄 친 표현의 의미로 옳은 것은?',
                  choices: ['A', 'B'],
                  sourcePage: 12,
                  bookName: '독해편기출문제2',
                  overcome: true,
                  attemptCount: 3,
                },
              ],
            },
          ],
        }),
      }),
      'POST /api/attempts': () => ({
        ok: true,
        json: async () => ({ isCorrect: true }),
      }),
    });
  });

  it('renders the type group header with outstanding/total counts', async () => {
    render(<NotebookPage />);

    expect(await screen.findByText('독해')).toBeInTheDocument();
    expect(screen.getByText('1/2 미해결 (50%)')).toBeInTheDocument();
  });

  it('renders an outstanding question as retryable and an overcome question as muted', async () => {
    render(<NotebookPage />);

    expect(await screen.findByText(/이 글의 주제로 가장 적절한 것은/)).toBeInTheDocument();
    expect(screen.getByText(/밑줄 친 표현의 의미로 옳은 것은/)).toBeInTheDocument();
    expect(screen.getByText('극복됨')).toBeInTheDocument();
    expect(screen.getByText('3번 시도 만에 정답')).toBeInTheDocument();
  });

  it('submits a retry via POST /api/attempts and shows the result', async () => {
    render(<NotebookPage />);

    await screen.findByText(/이 글의 주제로 가장 적절한 것은/);
    const user = userEvent.setup();
    await user.click(screen.getAllByText('A')[0]);

    await waitFor(() => expect(screen.getByText('정답입니다')).toBeInTheDocument());
  });

  it('shows attemptCount as original + 1 after a correct retry, not the stale original count', async () => {
    render(<NotebookPage />);

    await screen.findByText(/이 글의 주제로 가장 적절한 것은/);
    const user = userEvent.setup();
    // q1 starts with attemptCount: 1 and is not yet overcome.
    await user.click(screen.getAllByText('A')[0]);

    await waitFor(() => expect(screen.getByText('2번 시도 만에 정답')).toBeInTheDocument());
  });

  it('updates the group header outstanding count after a correct retry', async () => {
    render(<NotebookPage />);

    await screen.findByText(/이 글의 주제로 가장 적절한 것은/);
    expect(screen.getByText('1/2 미해결 (50%)')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByText('A')[0]);

    await waitFor(() => expect(screen.getByText('0/2 미해결 (0%)')).toBeInTheDocument());
  });

  it('shows an empty state when there are no wrong-note groups', async () => {
    mockFetch({
      '/api/notebook': () => ({ ok: true, json: async () => ({ groups: [] }) }),
    });

    render(<NotebookPage />);

    expect(await screen.findByText('아직 오답이 없어요 🎉')).toBeInTheDocument();
  });

  it('shows an error message when the notebook request fails', async () => {
    mockFetch({
      '/api/notebook': () => ({ ok: false, status: 500 }),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<NotebookPage />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
