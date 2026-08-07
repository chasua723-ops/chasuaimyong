import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { generateFromRandomPage } from '../quiz/generateFromRandomPage';

export interface GenerateEssayPracticeInput {
  bookId: string;
}

export interface EssayPracticeQuestion {
  id: string;
  prompt: string;
  sourcePage: number;
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

  const generated = await generateFromRandomPage(supabase, aiClient, {
    bookId: input.bookId,
    bookName: book.name,
    maxPage: Math.max(1, book.current_page),
    type: 'essay',
  });

  const { data: inserted, error } = await (supabase.from('questions') as any)
    .insert({
      book_id: input.bookId,
      session_id: null,
      type: 'essay',
      source_page: generated.sourcePage,
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
