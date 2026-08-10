import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HighlightedText from './HighlightedText';

describe('HighlightedText', () => {
  it('renders plain text unchanged when there is no [[ ]] marker', () => {
    render(<HighlightedText text="다음 중 옳은 것은?" />);

    expect(screen.getByText('다음 중 옳은 것은?')).toBeInTheDocument();
  });

  it('renders the [[ ]]-wrapped span with the highlight class, without the brackets', () => {
    render(<HighlightedText text="다음 문장에서 [[这个]]의 용법으로 옳은 것은?" />);

    const highlighted = screen.getByText('这个');
    expect(highlighted.tagName).toBe('SPAN');
    expect(highlighted.className).toMatch(/highlight/);
    expect(screen.queryByText(/\[\[/)).not.toBeInTheDocument();
  });

  it('renders text around the highlighted span', () => {
    render(<HighlightedText text="다음 문장에서 [[这个]]의 용법으로 옳은 것은?" />);

    expect(screen.getByText(/다음 문장에서/)).toBeInTheDocument();
    expect(screen.getByText(/의 용법으로 옳은 것은/)).toBeInTheDocument();
  });
});
