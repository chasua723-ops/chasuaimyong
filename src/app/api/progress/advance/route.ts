import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { advanceProgress } from '@/lib/progress/advanceProgress';
import { getTodayInSeoul } from '@/lib/date';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { bookId: string };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const result = await advanceProgress(supabase, getTodayInSeoul(), body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/progress/advance] failed:', err);
    return NextResponse.json({ error: '진도를 갱신하지 못했어요' }, { status: 500 });
  }
}
