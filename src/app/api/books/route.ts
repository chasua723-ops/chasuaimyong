import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: books, error } = await supabase.from('books').select('id, name');
  if (error) {
    console.error('[GET /api/books] failed:', error);
    return NextResponse.json({ error: '과목을 불러오지 못했어요' }, { status: 500 });
  }
  return NextResponse.json({ books: books ?? [] });
}
