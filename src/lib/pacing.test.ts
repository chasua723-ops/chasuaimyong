import { describe, it, expect } from 'vitest';
import { calculateDailyRange } from './pacing';

describe('calculateDailyRange', () => {
  it('spreads remaining pages evenly across remaining days for a single read-through', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-13',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 1,
    });

    // 10 days remaining, 100 pages remaining -> 10 pages/day
    expect(result.daysRemaining).toBe(10);
    expect(result.pagesPerDay).toBe(10);
    expect(result.startPage).toBe(1);
    expect(result.endPage).toBe(10);
  });

  it('accounts for multiple remaining read-throughs', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-05',
      today: '2026-08-03',
      targetReadCount: 3,
      currentReadCount: 1,
      currentPage: 1,
    });

    // 2 days remaining, 300 pages remaining (3 full reads) -> 150 pages/day, capped at totalPages
    expect(result.daysRemaining).toBe(2);
    expect(result.pagesPerDay).toBe(150);
    expect(result.startPage).toBe(1);
    expect(result.endPage).toBe(100);
  });

  it('resumes from the current page, not page 1', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-13',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 51,
    });

    expect(result.startPage).toBe(51);
    // 10 days remaining, 50 pages remaining -> 5 pages/day
    expect(result.endPage).toBe(55);
  });

  it('never returns fewer than 1 day remaining even if exam date has passed', () => {
    const result = calculateDailyRange({
      totalPages: 100,
      examDate: '2026-08-01',
      today: '2026-08-03',
      targetReadCount: 1,
      currentReadCount: 1,
      currentPage: 90,
    });

    expect(result.daysRemaining).toBe(1);
    expect(result.pagesPerDay).toBe(11);
    expect(result.endPage).toBe(100);
  });
});
