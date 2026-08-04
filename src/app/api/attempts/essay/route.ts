import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { recordEssayAttempt } from '@/lib/attempts/recordEssayAttempt';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    questionId: string;
    koreanDraft: string;
    chineseAnswer: string;
  };
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const result = await recordEssayAttempt(supabase, getAnthropicClient(), body);
  return NextResponse.json(result);
}
