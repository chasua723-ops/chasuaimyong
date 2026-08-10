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
  it('calls onSubmit with the chosen answer when not overcome', async () => {
    const onSubmit = vi.fn();
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByText('A'));

    expect(onSubmit).toHaveBeenCalledWith('q1', 'A');
  });

  it('does not render an overcome badge by default', () => {
    render(<QuizQuestion question={question} index={1} feedback={undefined} onSubmit={vi.fn()} />);

    expect(screen.queryByText('극복됨')).not.toBeInTheDocument();
  });

  it('renders a muted, disabled card with an overcome badge when overcome is true', async () => {
    const onSubmit = vi.fn();
    render(
      <QuizQuestion question={question} index={1} feedback={undefined} onSubmit={onSubmit} overcome />
    );

    expect(screen.getByText('극복됨')).toBeInTheDocument();
    const choiceButton = screen.getByText('A');
    expect(choiceButton).toBeDisabled();

    await userEvent.setup().click(choiceButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('highlights a [[ ]]-marked span within a choice, and submits the raw unmarked-looking text', async () => {
    const markedQuestion: Question = {
      ...question,
      choices: ['[[在]]他的脸上都是汗。', '他在书上写了很多汉字。'],
    };
    const onSubmit = vi.fn();
    render(<QuizQuestion question={markedQuestion} index={1} feedback={undefined} onSubmit={onSubmit} />);

    const highlighted = screen.getByText('在');
    expect(highlighted.tagName).toBe('SPAN');
    expect(highlighted.className).toMatch(/highlight/);

    await userEvent.setup().click(screen.getByText(/他的脸上都是汗/));
    expect(onSubmit).toHaveBeenCalledWith('q1', '[[在]]他的脸上都是汗。');
  });

  it('shows the attempt count when overcome and attemptCount are both provided', () => {
    render(
      <QuizQuestion
        question={question}
        index={1}
        feedback={undefined}
        onSubmit={vi.fn()}
        overcome
        attemptCount={3}
      />
    );

    expect(screen.getByText('3번 시도 만에 정답')).toBeInTheDocument();
  });
});
