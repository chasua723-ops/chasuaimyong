import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { getOrGenerateExplanation } from '@/lib/topics/getOrGenerateExplanation';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const explanation = await getOrGenerateExplanation(supabase, getAnthropicClient(), topicId);
    return NextResponse.json({ explanation });
  } catch (err) {
    console.error('[POST /api/study/[topicId]/explain] failed:', err);
    return NextResponse.json({ error: '해설을 만들지 못했어요' }, { status: 500 });
  }
}
