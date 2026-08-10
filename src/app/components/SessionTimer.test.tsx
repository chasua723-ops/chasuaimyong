import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import SessionTimer from './SessionTimer';

describe('SessionTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows 00:00 / 15:00 immediately after starting', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();

    render(<SessionTimer startedAt={startedAt} />);

    expect(screen.getByText('00:00 / 15:00')).toBeInTheDocument();
  });

  it('counts up every second while under the 15-minute target', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(<SessionTimer startedAt={startedAt} />);

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(screen.getByText('01:05 / 15:00')).toBeInTheDocument();
  });

  it('turns red and keeps counting past the 15-minute target', () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    render(<SessionTimer startedAt={startedAt} />);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 90 * 1000); // 16:30 elapsed
    });

    const timer = screen.getByText('16:30 / 15:00');
    expect(timer).toBeInTheDocument();
    expect(timer.className).toMatch(/over/);
  });
});
