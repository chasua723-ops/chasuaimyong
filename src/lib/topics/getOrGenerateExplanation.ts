import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { explainTopic } from '../ai/explainTopic';

export async function getOrGenerateExplanation(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  topicId: string
): Promise<string> {
  const { data: topic, error: topicError } = await (supabase.from('topics') as any)
    .select('*')
    .eq('id', topicId)
    .single();
  if (topicError || !topic) throw new Error(`Topic not found: ${topicId}`);

  if (topic.explanation) return topic.explanation;

  const { data: book, error: bookError } = await (supabase.from('books') as any)
    .select('name')
    .eq('id', topic.book_id)
    .single();
  if (bookError || !book) throw new Error(`Book not found: ${topic.book_id}`);

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

  if (!content.trim()) {
    throw new Error(`No book_pages content found for topic ${topicId} in range [${topic.start_page}, ${topic.end_page}]`);
  }

  const explanation = await explainTopic(aiClient, {
    bookName: book.name,
    topicName: topic.name,
    content,
  });

  const { error: updateError } = await (supabase.from('topics') as any)
    .update({ explanation })
    .eq('id', topicId);
  if (updateError) throw new Error(`Failed to save explanation: ${updateError.message}`);

  return explanation;
}
