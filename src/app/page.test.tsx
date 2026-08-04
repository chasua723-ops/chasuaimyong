import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from './page';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/session/today') {
        return {
          ok: true,
          json: async () => ({
            session: { id: 's1', essay_book_id: 'b1' },
            questions: [
              {
                id: 'q1',
                book_id: 'b1',
                type: 'grammar',
                prompt: '把자문의 어순은?',
                choices: ['A', 'B'],
                source_page: 12,
              },
              {
                id: 'q2',
                book_id: 'b1',
                type: 'essay',
                prompt: '루쉰 문학의 특징을 서술하시오',
                choices: null,
                source_page: 30,
              },
            ],
            vocab: { word_zh: '内卷', pinyin: 'nèijuǎn', meaning_ko: '내권' },
            bookRanges: [{ bookId: 'b1', name: '문법', startPage: 1, endPage: 10 }],
          }),
        } as any;
      }
      if (url === '/api/attempts') {
        return { ok: true, json: async () => ({ isCorrect: false, explanation: '설명', sourcePage: 12 }) } as any;
      }
      if (url === '/api/attempts/essay') {
        return {
          ok: true,
          json: async () => ({ contentScore: 75, chineseScore: 55, feedback: '표현 개선 필요' }),
        } as any;
      }
      throw new Error(`unhandled fetch: ${url}`);
    })
  );
});

describe('Daily session page', () => {
  it('loads today\'s questions and shows the explanation after an answer is submitted', async () => {
    render(<Page />);

    expect(await screen.findByText('把자문의 어순은?')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('A'));

    await waitFor(() => expect(screen.getByText(/설명/)).toBeInTheDocument());
    expect(screen.getByText(/12페이지/)).toBeInTheDocument();
  });

  it('shows the AI-curated vocab of the day labeled as AI content', async () => {
    render(<Page />);

    expect(await screen.findByText('内卷')).toBeInTheDocument();
    expect(screen.getByText(/AI 큐레이션/)).toBeInTheDocument();
  });

  it('shows today\'s reading range per book', async () => {
    render(<Page />);

    expect(await screen.findByText(/문법: 1~10페이지/)).toBeInTheDocument();
  });

  it('shows an error message instead of the loading state when the session request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as any)
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Page />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('submits the two-stage essay answer and shows separate content/Chinese scores', async () => {
    render(<Page />);

    const [koreanBox, chineseBox] = await screen.findAllByRole('textbox');
    const user = userEvent.setup();
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText(/75점/)).toBeInTheDocument());
    expect(screen.getByText(/55점/)).toBeInTheDocument();
    expect(screen.getByText(/표현 개선 필요/)).toBeInTheDocument();
  });
});
