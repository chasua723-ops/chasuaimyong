import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoverScreen from './CoverScreen';
import type { BookRange } from './types';

const bookRanges: BookRange[] = [
  { bookId: 'b1', name: '문법', startPage: 11, endPage: 19 },
  { bookId: 'b2', name: '문학개론', startPage: 8, endPage: 14 },
];

describe('CoverScreen', () => {
  it('renders the title and each book range', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    expect(screen.getByText('오늘의 학습')).toBeInTheDocument();
    expect(screen.getByText(/문법 · 11~19p/)).toBeInTheDocument();
    expect(screen.getByText(/문학개론 · 8~14p/)).toBeInTheDocument();
  });

  it('calls onStart when the start nav card is clicked', async () => {
    const onStart = vi.fn();
    render(<CoverScreen bookRanges={bookRanges} onStart={onStart} />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/오늘의 학습 시작하기/));

    expect(onStart).toHaveBeenCalled();
  });

  it('links to the wrong-answer notebook via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/오답노트/).closest('a');
    expect(link).toHaveAttribute('href', '/notebook');
  });

  it('links to the essay notebook via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/서술형 노트/).closest('a');
    expect(link).toHaveAttribute('href', '/essay-notes');
  });

  it('links to the quiz practice record via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/더 풀기/).closest('a');
    expect(link).toHaveAttribute('href', '/quiz-practice');
  });

  it('links to study mode via a nav card', () => {
    render(<CoverScreen bookRanges={bookRanges} onStart={vi.fn()} />);

    const link = screen.getByText(/학습하기/).closest('a');
    expect(link).toHaveAttribute('href', '/study');
  });
});
