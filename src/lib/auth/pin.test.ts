import { describe, it, expect } from 'vitest';
import { verifyPin } from './pin';

describe('verifyPin', () => {
  it('returns true when PIN matches exactly', () => {
    expect(verifyPin('1234', '1234')).toBe(true);
  });

  it('returns false when PIN does not match', () => {
    expect(verifyPin('0000', '1234')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(verifyPin(' 1234 ', '1234')).toBe(true);
  });
});
