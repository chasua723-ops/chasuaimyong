import type { TopicRow } from '@/types/db';

export interface TopicGroup {
  parent: TopicRow;
  children: TopicRow[];
}

export function groupTopics(topics: TopicRow[]): TopicGroup[] {
  const topLevel = topics.filter((t) => t.parent_id === null);
  return topLevel.map((parent) => ({
    parent,
    children: topics.filter((t) => t.parent_id === parent.id),
  }));
}
