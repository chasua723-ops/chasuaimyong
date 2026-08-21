import type { SupabaseClient } from '@supabase/supabase-js';

export interface TopicDetail {
  topic: { id: string; name: string; startPage: number; endPage: number };
  content: string;
  explanation: string | null;
}

export async function getTopicDetail(supabase: SupabaseClient, topicId: string): Promise<TopicDetail> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${topicId}`);

  const { data: pages, error: pagesError } = await (supabase.from('book_pages') as any)
    .select('page_num, content')
    .eq('book_id', topic.book_id)
    .gte('page_num', topic.start_page)
    .lte('page_num', topic.end_page);
  if (pagesError) throw new Error(`Failed to fetch topic content: ${pagesError.message}`);

  const content = [...(pages ?? [])]
    .sort((a: any, b: any) => a.page_num - b.page_num)
    .map((p: any) => p.content)
    .join('\n\n');

  return {
    topic: { id: topic.id, name: topic.name, startPage: topic.start_page, endPage: topic.end_page },
    content,
    explanation: topic.explanation ?? null,
  };
}
