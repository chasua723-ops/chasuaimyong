import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const isAuthed = req.cookies.get('imyong_auth')?.value === 'ok';
  const isPublic =
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/api/auth');

  if (!isAuthed && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
