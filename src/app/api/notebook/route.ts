import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWrongNotes } from '@/lib/notebook/getWrongNotes';

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const groups = await getWrongNotes(supabase);
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('[GET /api/notebook] failed:', err);
    return NextResponse.json({ error: 'Failed to load wrong-answer notebook' }, { status: 500 });
  }
}
