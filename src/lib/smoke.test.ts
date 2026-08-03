import { describe, it, expect } from 'vitest';
import { add } from './smoke';

describe('smoke', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
