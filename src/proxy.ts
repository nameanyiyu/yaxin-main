import { NextRequest, NextResponse } from 'next/server';
import { adminSessionCookieName, isValidAdminAuthorization, isValidAdminSession } from '@/lib/admin-auth';

export function proxy(request: NextRequest) {
  const username = process.env.PREAUDIT_ADMIN_USER;
  const password = process.env.PREAUDIT_ADMIN_PASSWORD;
  if (!username || !password) {
    return NextResponse.next();
  }

  const basicAuthorized = isValidAdminAuthorization(request.headers.get('authorization'), username, password);
  const sessionAuthorized = isValidAdminSession(request.cookies.get(adminSessionCookieName())?.value, username, password);
  if (basicAuthorized || sessionAuthorized) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'ADMIN_AUTH_REQUIRED', message: '请先登录后台' } }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
