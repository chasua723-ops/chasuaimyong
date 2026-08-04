import { describe, it, expect } from 'vitest';
import { getTodayInSeoul } from './date';

describe('getTodayInSeoul', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(getTodayInSeoul()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rolls to the next day at 15:00 UTC, which is midnight KST', () => {
    // 2026-08-03T14:59Z is 2026-08-03 23:59 KST (still the 3rd).
    expect(getTodayInSeoul(new Date('2026-08-03T14:59:00Z'))).toBe('2026-08-03');
    // 2026-08-03T15:00Z is 2026-08-04 00:00 KST (already the 4th).
    expect(getTodayInSeoul(new Date('2026-08-03T15:00:00Z'))).toBe('2026-08-04');
  });

  it('returns the Korean date during the 00:00-09:00 KST window where UTC still reads yesterday', () => {
    // 2026-08-03T22:30Z -> 2026-08-04 07:30 KST. UTC slicing would give 2026-08-03.
    const utcDate = new Date('2026-08-03T22:30:00Z').toISOString().slice(0, 10);
    expect(utcDate).toBe('2026-08-03');
    expect(getTodayInSeoul(new Date('2026-08-03T22:30:00Z'))).toBe('2026-08-04');
  });
});
