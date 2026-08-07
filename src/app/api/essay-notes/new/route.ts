import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { generateEssayPractice } from '@/lib/essay/generateEssayPractice';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { bookId: string };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const question = await generateEssayPractice(supabase, getAnthropicClient(), body);
    return NextResponse.json(question);
  } catch (err) {
    console.error('[POST /api/essay-notes/new] failed:', err);
    return NextResponse.json({ error: '새 서술형 문제를 만들지 못했어요' }, { status: 500 });
  }
}
