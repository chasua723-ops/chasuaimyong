import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { assembleDailySession } from '@/lib/session/assembleDailySession';
import { calculateDailyRange } from '@/lib/pacing';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = new Date().toISOString().slice(0, 10);

  const session = await assembleDailySession(supabase, getAnthropicClient(), today);

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', session.id);

  const { data: vocab } = await supabase
    .from('vocab_of_the_day')
    .select('*')
    .eq('date', today)
    .maybeSingle();

  const { data: books } = await supabase.from('books').select('*');
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
