import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { runSearch } from '@/lib/search/runSearch';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    history?: { question: string; answer: string }[];
  };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const result = await runSearch(supabase, getAnthropicClient(), {
      query: body.query,
      history: body.history,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/search] failed:', err);
    return NextResponse.json({ error: '검색하지 못했어요' }, { status: 500 });
  }
}
