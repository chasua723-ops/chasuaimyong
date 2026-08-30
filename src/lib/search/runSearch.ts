import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { searchBookPages, type SearchMatch } from './searchBookPages';
import { answerSearchQuery, type SearchHistoryTurn } from '../ai/answerSearchQuery';

const MAX_EXCERPTS_FOR_AI = 10;

export interface RunSearchInput {
  query: string;
  history?: SearchHistoryTurn[];
}

export interface RunSearchResult {
  answer: string;
  matches: SearchMatch[];
}

export async function runSearch(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: RunSearchInput
): Promise<RunSearchResult> {
  const matches = await searchBookPages(supabase, input.query);
  if (matches.length === 0) {
    return { answer: '', matches: [] };
  }

  const answer = await answerSearchQuery(aiClient, {
    query: input.query,
    excerpts: matches.slice(0, MAX_EXCERPTS_FOR_AI).map((m) => ({
      bookName: m.bookName,
      pageNum: m.pageNum,
      content: m.content,
    })),
    history: input.history,
  });

  return { answer, matches };
}
