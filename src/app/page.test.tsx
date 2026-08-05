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
  it("shows the cover screen first, with today's book ranges and a start button", async () => {
    render(<Page />);

    expect(await screen.findByText('오늘의 학습')).toBeInTheDocument();
    expect(screen.getByText(/문법 · 1~10p/)).toBeInTheDocument();
    expect(screen.queryByText(/把자문의 어순은/)).not.toBeInTheDocument();
  });

  it('shows the book section with questions after clicking start', async () => {
    render(<Page />);

    const startButton = await screen.findByText('오늘의 학습 시작하기 →');
    const user = userEvent.setup();
    await user.click(startButton);

    expect(await screen.findByText(/把자문의 어순은\?/)).toBeInTheDocument();
    expect(screen.getByText(/Q1\./)).toBeInTheDocument();
  });

  it('shows the explanation and source page after answering a quiz question incorrectly', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));
    await user.click(await screen.findByText('A'));

    await waitFor(() => expect(screen.getByText(/설명/)).toBeInTheDocument());
    expect(screen.getByText(/12페이지 참고/)).toBeInTheDocument();
  });

  it('submits the two-stage essay answer and shows separate content/Chinese scores', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    const [koreanBox, chineseBox] = await screen.findAllByRole('textbox');
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText(/75점/)).toBeInTheDocument());
    expect(screen.getByText(/55점/)).toBeInTheDocument();
    expect(screen.getByText(/표현 개선 필요/)).toBeInTheDocument();
  });

  it('shows the AI-curated vocab of the day labeled as AI content, after starting', async () => {
    render(<Page />);

    await userEvent.setup().click(await screen.findByText('오늘의 학습 시작하기 →'));

    expect(await screen.findByText('内卷')).toBeInTheDocument();
    expect(screen.getByText('AI 큐레이션')).toBeInTheDocument();
  });
});
