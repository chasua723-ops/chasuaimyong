import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTopicDetail } from '@/lib/topics/getTopicDetail';

export async function GET(_req: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const detail = await getTopicDetail(supabase, topicId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error('[GET /api/study/[topicId]] failed:', err);
    return NextResponse.json({ error: '학습 내용을 불러오지 못했어요' }, { status: 500 });
  }
}
