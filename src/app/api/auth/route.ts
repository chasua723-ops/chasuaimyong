import { NextRequest, NextResponse } from 'next/server';
import { verifyPin } from '@/lib/auth/pin';
import { signAuthToken } from '@/lib/auth/token';

export async function POST(req: NextRequest) {
  const { pin } = (await req.json()) as { pin?: string };
  const expected = process.env.APP_PIN;

  if (!expected) {
    return NextResponse.json({ error: 'PIN not configured' }, { status: 500 });
  }
  if (!pin || !verifyPin(pin, expected)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('imyong_auth', await signAuthToken(expected), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
