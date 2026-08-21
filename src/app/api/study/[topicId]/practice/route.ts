import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAnthropicClient } from '@/lib/ai/client';
import { generateTopicPractice } from '@/lib/quiz/generateTopicPractice';

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const question = await generateTopicPractice(supabase, getAnthropicClient(), { topicId });
    return NextResponse.json(question);
  } catch (err) {
    console.error('[POST /api/study/[topicId]/practice] failed:', err);
    return NextResponse.json({ error: '연습문제를 만들지 못했어요' }, { status: 500 });
  }
}
