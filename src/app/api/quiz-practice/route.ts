import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQuizPracticeNotes } from '@/lib/quiz/getQuizPracticeNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const notes = await getQuizPracticeNotes(supabase);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error('[GET /api/quiz-practice] failed:', err);
    return NextResponse.json({ error: '더 풀기 기록을 불러오지 못했어요' }, { status: 500 });
  }
}
