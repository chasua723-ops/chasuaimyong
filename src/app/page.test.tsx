import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
          json: async () => ({
            conceptScore: 3,
            conceptChecklist: [
              { concept: '루쉰의 사실주의 기법', covered: true },
              { concept: '광인일기의 상징', covered: false },
              { concept: '봉건 사회 비판', covered: true },
              { concept: '백화문 사용', covered: true },
            ],
            grammarCorrections: [],
          }),
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

  it('submits the two-stage essay answer and shows the concept checklist score', async () => {
    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    const koreanBox = await screen.findByLabelText(/1단계/);
    const chineseBox = await screen.findByLabelText(/2단계/);
    await user.type(koreanBox, '루쉰은 사실주의 기법으로...');
    await user.type(chineseBox, '鲁迅用现实主义手法...');
    await user.click(screen.getByText('제출'));

    await waitFor(() => expect(screen.getByText('3/4점')).toBeInTheDocument());
    expect(screen.getByText(/루쉰의 사실주의 기법/)).toBeInTheDocument();
  });

  it('shows the AI-curated vocab of the day labeled as AI content, after starting', async () => {
    render(<Page />);

    await userEvent.setup().click(await screen.findByText('오늘의 학습 시작하기 →'));

    expect(await screen.findByText('内卷')).toBeInTheDocument();
    expect(screen.getByText('AI 큐레이션')).toBeInTheDocument();
  });

  it('groups questions under the correct book section and restarts numbering at Q1 per section', async () => {
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
                  id: 'g1',
                  book_id: 'b1',
                  type: 'grammar',
                  prompt: '把자문의 어순 규칙을 고르세요',
                  choices: ['A', 'B'],
                  source_page: 12,
                },
                {
                  id: 'g2',
                  book_id: 'b1',
                  type: 'grammar',
                  prompt: '被자문의 용법으로 알맞은 것은?',
                  choices: ['A', 'B'],
                  source_page: 13,
                },
                {
                  id: 'l1',
                  book_id: 'b2',
                  type: 'grammar',
                  prompt: '루쉰의 대표작으로 알맞은 것은?',
                  choices: ['A', 'B'],
                  source_page: 40,
                },
                {
                  id: 'l2',
                  book_id: 'b2',
                  type: 'grammar',
                  prompt: '향토문학의 특징으로 옳은 것은?',
                  choices: ['A', 'B'],
                  source_page: 41,
                },
              ],
              vocab: { word_zh: '内卷', pinyin: 'nèijuǎn', meaning_ko: '내권' },
              bookRanges: [
                { bookId: 'b1', name: '문법', startPage: 1, endPage: 10 },
                { bookId: 'b2', name: '문학개론', startPage: 11, endPage: 19 },
              ],
            }),
          } as any;
        }
        throw new Error(`unhandled fetch: ${url}`);
      })
    );

    render(<Page />);

    const user = userEvent.setup();
    await user.click(await screen.findByText('오늘의 학습 시작하기 →'));

    await screen.findByText(/把자문의 어순 규칙을 고르세요/);

    expect(screen.getAllByText(/Q1\./)).toHaveLength(2);

    const grammarSection = screen.getByText('문법').closest('section');
    const literatureSection = screen.getByText('문학개론').closest('section');
    expect(grammarSection).not.toBeNull();
    expect(literatureSection).not.toBeNull();

    const withinGrammar = within(grammarSection as HTMLElement);
    expect(withinGrammar.getByText(/把자문의 어순 규칙을 고르세요/)).toBeInTheDocument();
    expect(withinGrammar.getByText(/被자문의 용법으로 알맞은 것은/)).toBeInTheDocument();
    expect(withinGrammar.queryByText(/루쉰의 대표작으로 알맞은 것은/)).not.toBeInTheDocument();
    expect(withinGrammar.queryByText(/향토문학의 특징으로 옳은 것은/)).not.toBeInTheDocument();

    const withinLiterature = within(literatureSection as HTMLElement);
    expect(withinLiterature.getByText(/루쉰의 대표작으로 알맞은 것은/)).toBeInTheDocument();
    expect(withinLiterature.getByText(/향토문학의 특징으로 옳은 것은/)).toBeInTheDocument();
    expect(withinLiterature.queryByText(/把자문의 어순 규칙을 고르세요/)).not.toBeInTheDocument();
    expect(withinLiterature.queryByText(/被자문의 용법으로 알맞은 것은/)).not.toBeInTheDocument();
  });

  it('shows an error message instead of the loading state when the session request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/session/today') {
          return { ok: false, status: 500 } as any;
        }
        throw new Error(`unhandled fetch: ${url}`);
      })
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Page />);

    expect(await screen.findByText(/불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
