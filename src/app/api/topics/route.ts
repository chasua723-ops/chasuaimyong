import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get('bookId');
  if (!bookId) return NextResponse.json({ error: 'bookId is required' }, { status: 400 });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: topics, error } = await supabase.from('topics').select('*').eq('book_id', bookId);
  if (error) {
    console.error('[GET /api/topics] failed:', error);
    return NextResponse.json({ error: '주제를 불러오지 못했어요' }, { status: 500 });
  }
  return NextResponse.json({ topics: topics ?? [] });
}
