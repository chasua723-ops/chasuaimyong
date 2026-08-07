import { describe, it, expect } from 'vitest';
import { calculateWeights, pickWeightedTypes, QUIZ_TYPES, type CategoryStat } from './adaptive';

describe('calculateWeights', () => {
  it('gives higher weight to categories with lower accuracy', () => {
    const stats: CategoryStat[] = [
      { type: 'reading', correctCount: 1, totalCount: 10 }, // 10% accuracy
      { type: 'grammar', correctCount: 9, totalCount: 10 }, // 90% accuracy
    ];

    const weights = calculateWeights(stats);

    expect(weights.reading).toBeGreaterThan(weights.grammar);
  });

  it('treats categories with no attempts as medium priority (0.5 accuracy)', () => {
    const stats: CategoryStat[] = [{ type: 'vocab', correctCount: 0, totalCount: 0 }];
    const weights = calculateWeights(stats);
    expect(weights.vocab).toBeCloseTo(0.5, 5);
  });

  it('never assigns a weight below the 0.1 floor', () => {
    const stats: CategoryStat[] = [{ type: 'theory', correctCount: 10, totalCount: 10 }];
    const weights = calculateWeights(stats);
    expect(weights.theory).toBeGreaterThanOrEqual(0.1);
  });
});

describe('pickWeightedTypes', () => {
  it('always picks the only type with nonzero weight', () => {
    const picks = pickWeightedTypes(
      { grammar: 1, vocab: 0, reading: 0, theory: 0, essay: 0 },
      3,
      () => 0.5
    );
    expect(picks).toEqual(['grammar', 'grammar', 'grammar']);
  });

  it('returns exactly `count` picks', () => {
    const picks = pickWeightedTypes(
      { grammar: 0.5, vocab: 0.5, reading: 0.5, theory: 0.5, essay: 0.5 },
      5,
      () => 0.99
    );
    expect(picks).toHaveLength(5);
  });
});

describe('QUIZ_TYPES', () => {
  it('exports the four quiz question types in a fixed order', () => {
    expect(QUIZ_TYPES).toEqual(['grammar', 'vocab', 'reading', 'theory']);
  });
});
