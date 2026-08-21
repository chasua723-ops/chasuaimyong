import { describe, it, expect } from 'vitest';
import { groupTopics } from './groupTopics';
import type { TopicRow } from '@/types/db';

function topic(overrides: Partial<TopicRow>): TopicRow {
  return {
    id: 't',
    book_id: 'b1',
    parent_id: null,
    name: '',
    start_page: 1,
    end_page: 1,
    explanation: null,
    ...overrides,
  };
}

describe('groupTopics', () => {
  it('groups each top-level topic with its children, preserving order', () => {
    const topics: TopicRow[] = [
      topic({ id: 'p1', name: '1장' }),
      topic({ id: 'c1', parent_id: 'p1', name: '1절' }),
      topic({ id: 'c2', parent_id: 'p1', name: '2절' }),
      topic({ id: 'p2', name: '2장' }),
      topic({ id: 'c3', parent_id: 'p2', name: '1절' }),
    ];

    const result = groupTopics(topics);

    expect(result).toEqual([
      { parent: topics[0], children: [topics[1], topics[2]] },
      { parent: topics[3], children: [topics[4]] },
    ]);
  });

  it('gives a childless top-level topic an empty children array', () => {
    const topics: TopicRow[] = [topic({ id: 'p1', name: '서론' })];

    expect(groupTopics(topics)).toEqual([{ parent: topics[0], children: [] }]);
  });
});
