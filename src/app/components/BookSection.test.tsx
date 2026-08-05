// src/app/components/BookSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
