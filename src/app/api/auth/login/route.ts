import { createAdminSessionToken } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expectedUser = process.env.PREAUDIT_ADMIN_USER;
  const expectedPassword = process.env.PREAUDIT_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return Response.json({ error: '后台登录尚未配置' }, { status: 503 });
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return Response.json({ error: '请求内容无效' }, { status: 400 });
  }

  if (body.username !== expectedUser || body.password !== expectedPassword) {
    return Response.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    'Set-Cookie',
    `preaudit_admin_session=${createAdminSessionToken(expectedUser, expectedPassword)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );
  return response;
}
