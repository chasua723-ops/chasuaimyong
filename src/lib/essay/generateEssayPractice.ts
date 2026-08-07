import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { generateQuestions } from '../ai/generateQuestions';

export interface GenerateEssayPracticeInput {
  bookId: string;
}

export interface EssayPracticeQuestion {
  id: string;
  prompt: string;
  sourcePage: number;
}

function randomPage(maxPage: number): number {
  return Math.floor(Math.random() * maxPage) + 1;
}

export async function generateEssayPractice(
  supabase: SupabaseClient,
  aiClient: Anthropic,
  input: GenerateEssayPracticeInput
): Promise<EssayPracticeQuestion> {
  const { data: book } = await (supabase.from('books') as any)
    .select('*')
    .eq('id', input.bookId)
    .single();
  if (!book) throw new Error('Book not found');

  const maxPage = Math.max(1, book.current_page);

  let page: { page_num: number; content: string } | null = null;
  for (let attempt = 0; attempt < 2 && !page; attempt++) {
    const pageNum = randomPage(maxPage);
    const { data } = await (supabase.from('book_pages') as any)
      .select('page_num, content')
      .eq('book_id', input.bookId)
      .eq('page_num', pageNum)
      .maybeSingle();
    page = data;
  }
  if (!page) throw new Error('No page content found for essay practice');

  const [generated] = await generateQuestions(aiClient, {
    bookName: book.name,
    pages: [{ pageNum: page.page_num, content: page.content }],
    types: ['essay'],
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: input.bookId,
      session_id: null,
      type: 'essay',
      // Always use the page we actually fetched and sent to generateQuestions,
      // never the AI's echoed sourcePage: a page outside what it was shown
      // would silently break the later book_pages lookup in recordEssayAttempt.
      source_page: page.page_num,
      prompt: generated.prompt,
      choices: null,
      correct_answer: generated.correctAnswer,
      used_reference: false,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert essay practice question: ${error.message}`);

  return { id: inserted.id, prompt: inserted.prompt, sourcePage: inserted.source_page };
}
