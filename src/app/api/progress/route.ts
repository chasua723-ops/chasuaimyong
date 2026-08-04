import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProgress } from '@/lib/progress/getProgress';

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await getProgress(supabase);
  return NextResponse.json(result);
}
