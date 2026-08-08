// src/app/components/BookSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookSection from './BookSection';
import type { Question } from './types';

const quizQuestions: Question[] = [
  { id: 'q1', book_id: 'b1', type: 'grammar', prompt: '문제1', choices: ['A', 'B'], source_page: 12 },
  { id: 'q2', book_id: 'b1', type: 'vocab', prompt: '문제2', choices: ['C', 'D'], source_page: 13 },
];

const essayQuestion: Question = {
  id: 'q3',
  book_id: 'b1',
  type: 'essay',
  prompt: '서술형 문제',
  choices: null,
  source_page: 30,
};

const noop = {
  onSubmitQuiz: vi.fn(),
  onKoreanChange: vi.fn(),
  onChineseChange: vi.fn(),
  onSubmitEssay: vi.fn(),
};

describe('BookSection', () => {
  it('renders the book icon, name, and page range', () => {
    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('📘')).toBeInTheDocument();
    expect(screen.getByText('문법')).toBeInTheDocument();
    expect(screen.getByText('11~19p')).toBeInTheDocument();
  });

  it('numbers quiz questions starting from 1 within the section', () => {
    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText(/Q1\./)).toBeInTheDocument();
    expect(screen.getByText(/Q2\./)).toBeInTheDocument();
  });

  it('falls back to a default icon for an unrecognized book name', () => {
    render(
      <BookSection
        bookId="b1"
        name="새교재"
        startPage={1}
        endPage={5}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('📕')).toBeInTheDocument();
  });

  it('renders the essay question only when one is provided', () => {
    render(
      <BookSection
        bookId="b1"
        name="문학개론"
        startPage={8}
        endPage={14}
        quizQuestions={[]}
        essayQuestion={essayQuestion}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('서술형')).toBeInTheDocument();
    expect(screen.getByText('서술형 문제')).toBeInTheDocument();
  });

  it('always shows a "더 풀기" button, even before finishing the daily questions', () => {
    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('더 풀기')).toBeInTheDocument();
  });

  it('generates and renders a new practice question when "더 풀기" is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1', type: 'grammar', prompt: '연습 문제', choices: ['X', 'Y'], sourcePage: 7 }),
    }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('더 풀기'));

    expect(await screen.findByText(/연습 문제/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/quiz-practice/new',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ bookId: 'b1' }) })
    );
  });

  it('submits a practice answer to /api/attempts and shows feedback', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'p1', type: 'grammar', prompt: '연습 문제', choices: ['X', 'Y'], sourcePage: 7 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isCorrect: true }),
      }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('더 풀기'));
    await screen.findByText(/연습 문제/);
    await user.click(screen.getByText('X'));

    expect(await screen.findByText('정답입니다')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/attempts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ questionId: 'p1', userAnswer: 'X' }),
      })
    );
  });

  it('always shows a button to confirm today\'s pages were read', () => {
    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={quizQuestions}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('오늘 분량 다 읽었어요')).toBeInTheDocument();
  });

  it('advances progress and updates the displayed page range when confirmed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bookId: 'b1',
        currentPage: 20,
        currentReadCount: 1,
        range: { startPage: 20, endPage: 28 },
      }),
    }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    expect(screen.getByText('11~19p')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('오늘 분량 다 읽었어요'));

    expect(await screen.findByText('20~28p')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/progress/advance',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ bookId: 'b1' }) })
    );
  });

  it('shows an error and keeps the old range when confirming progress fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;

    render(
      <BookSection
        bookId="b1"
        name="문법"
        startPage={11}
        endPage={19}
        quizQuestions={[]}
        essayQuestion={undefined}
        quizFeedback={{}}
        koreanDraft=""
        chineseAnswer=""
        essayFeedback={undefined}
        {...noop}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('오늘 분량 다 읽었어요'));

    expect(await screen.findByText('진도를 갱신하지 못했어요. 다시 시도해주세요.')).toBeInTheDocument();
    expect(screen.getByText('11~19p')).toBeInTheDocument();
  });
});
