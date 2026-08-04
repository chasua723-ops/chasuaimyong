import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth/token';

export async function middleware(req: NextRequest) {
  const isPublic =
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/api/auth');

  if (isPublic) return NextResponse.next();

  // Read at request time: APP_PIN is a server-side runtime env var.
  const pin = process.env.APP_PIN;
  const cookieValue = req.cookies.get('imyong_auth')?.value ?? '';
  const isAuthed = !!pin && (await verifyAuthToken(cookieValue, pin));

  if (!isAuthed) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
