import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuizPracticePage from './page';

describe('QuizPracticePage', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders the notes list', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        notes: [
          {
            id: 'a1',
            bookName: '전공중국어 문법',
            type: 'grammar',
            prompt: '연습 문제',
            choices: ['A', 'B'],
            userAnswer: 'A',
            isCorrect: true,
            sourcePage: 3,
            createdAt: '2026-08-07T10:00:00Z',
          },
        ],
      }),
    });

    render(<QuizPracticePage />);

    expect(await screen.findByText('연습 문제')).toBeInTheDocument();
    expect(screen.getByText('전공중국어 문법')).toBeInTheDocument();
    expect(screen.getByText('문법')).toBeInTheDocument();
  });

  it('shows an empty state when there are no notes', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ notes: [] }) });

    render(<QuizPracticePage />);

    expect(await screen.findByText('아직 더 풀기로 만든 문제가 없어요.')).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network error'));

    render(<QuizPracticePage />);

    expect(await screen.findByText('더 풀기를 불러오지 못했어요. 새로고침 해주세요.')).toBeInTheDocument();
  });
});
