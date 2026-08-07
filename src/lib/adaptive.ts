import type { QuestionType } from '@/types/db';

export interface CategoryStat {
  type: QuestionType;
  correctCount: number;
  totalCount: number;
}

export const QUIZ_TYPES = ['grammar', 'vocab', 'reading', 'theory'] as const;

export function calculateWeights(stats: CategoryStat[]): Record<QuestionType, number> {
  const weights = {} as Record<QuestionType, number>;
  for (const stat of stats) {
    const accuracy = stat.totalCount === 0 ? 0.5 : stat.correctCount / stat.totalCount;
    weights[stat.type] = Math.max(0.1, 1 - accuracy);
  }
  return weights;
}

export function pickWeightedTypes(
  weights: Record<QuestionType, number>,
  count: number,
  rng: () => number = Math.random
): QuestionType[] {
  const entries = Object.entries(weights) as [QuestionType, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  const picks: QuestionType[] = [];

  for (let i = 0; i < count; i++) {
    let r = rng() * totalWeight;
    let chosen: QuestionType = entries[entries.length - 1][0];
    for (const [type, w] of entries) {
      if (r <= w) {
        chosen = type;
        break;
      }
      r -= w;
    }
    picks.push(chosen);
  }
  return picks;
}
