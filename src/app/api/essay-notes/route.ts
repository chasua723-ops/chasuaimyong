import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEssayNotes } from '@/lib/essay/getEssayNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const notes = await getEssayNotes(supabase);
    const { data: books } = await supabase.from('books').select('id, name');
    return NextResponse.json({ notes, books: books ?? [] });
  } catch (err) {
    console.error('[GET /api/essay-notes] failed:', err);
    return NextResponse.json({ error: '서술형 노트를 불러오지 못했어요' }, { status: 500 });
  }
}
