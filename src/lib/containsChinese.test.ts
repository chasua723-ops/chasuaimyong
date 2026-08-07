import { describe, it, expect } from 'vitest';
import { containsChinese } from './containsChinese';

describe('containsChinese', () => {
  it('returns false for Korean-only text', () => {
    expect(containsChinese('한국어만 있는 문장입니다')).toBe(false);
  });

  it('returns true for text made entirely of Chinese characters', () => {
    expect(containsChinese('学习汉语很重要')).toBe(true);
  });

  it('returns true for text mixing Korean and Chinese characters', () => {
    expect(containsChinese('把자문의 어순은?')).toBe(true);
  });

  it('returns false for empty text', () => {
    expect(containsChinese('')).toBe(false);
  });
});
