import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { assembleDailySession } from '@/lib/session/assembleDailySession';
import { calculateDailyRange } from '@/lib/pacing';
import { getTodayInSeoul } from '@/lib/date';

// The first request of a new day assembles the whole day's session (AI generation across
// every book), which can take longer than the platform's default function timeout even with
// concurrent generation. Every request after that hits the early-return cached-session path
// and is fast.
export const maxDuration = 60;

export async function GET() {
  try {
    return await handleGet();
  } catch (err) {
    console.error('[GET /api/session/today] failed:', err);
    return NextResponse.json({ error: "Failed to load today's session" }, { status: 500 });
  }
}

async function handleGet() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = getTodayInSeoul();

  const session = await assembleDailySession(supabase, getAnthropicClient(), today);

  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', session.id);
  if (questionsError) throw new Error(`Failed to fetch questions: ${questionsError.message}`);

  const { data: vocab, error: vocabError } = await supabase
    .from('vocab_of_the_day')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (vocabError) throw new Error(`Failed to fetch vocab of the day: ${vocabError.message}`);

  const { data: books, error: booksError } = await supabase.from('books').select('*');
  if (booksError) throw new Error(`Failed to fetch books: ${booksError.message}`);
  const bookRanges = (books ?? []).map((b: any) => {
    const range = calculateDailyRange({
      totalPages: b.total_pages,
      examDate: b.exam_date,
      today,
      targetReadCount: b.target_read_count,
      currentReadCount: b.current_read_count,
      currentPage: b.current_page,
    });
    return { bookId: b.id, name: b.name, startPage: range.startPage, endPage: range.endPage };
  });

  return NextResponse.json({ session, questions: questions ?? [], vocab, bookRanges });
}
