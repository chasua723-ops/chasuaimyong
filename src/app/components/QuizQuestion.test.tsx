import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizQuestion from './QuizQuestion';
import type { Question } from './types';

const question: Question = {
  id: 'q1',
  book_id: 'b1',
  type: 'grammar',
  prompt: '把자문의 어순은?',
  choices: ['A', 'B'],
  source_page: 12,
};

describe('QuizQuestion', () => {
  it('renders the question with its section-local number and choices', () => {
    render(<QuizQuestion question={question} index={2} feedback={undefined} onSubmit={vi.fn()} />);

    expect(screen.getByText(/Q2\./)).toBeInTheDocument();
    expect(screen.getByText(/把자문의 어순은\?/)).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('calls onSubmit with the question id and chosen answer when a choice is clicked', async () => {
    const onSubmit = vi.fn();
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('A'));

    expect(onSubmit).toHaveBeenCalledWith('q1', 'A');
  });

  it('shows the explanation and source page when the feedback is a wrong answer', () => {
    render(
      <QuizQuestion
        question={question}
        index={1}
        feedback={{ explanation: '설명입니다', sourcePage: 12 }}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(/설명입니다/)).toBeInTheDocument();
    expect(screen.getByText(/12페이지 참고/)).toBeInTheDocument();
  });

  it('shows a correct message when feedback is "correct"', () => {
    render(<QuizQuestion question={question} index={1} feedback="correct" onSubmit={vi.fn()} />);
    expect(screen.getByText('정답입니다')).toBeInTheDocument();
  });
});
