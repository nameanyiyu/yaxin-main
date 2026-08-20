import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function isValidAdminAuthorization(
  authorization: string | null,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  if (!authorization?.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), expectedUser)
      && safeEqual(decoded.slice(separator + 1), expectedPassword);
  } catch {
    return false;
  }
}

const SESSION_COOKIE = 'preaudit_admin_session';

export function adminSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function createAdminSessionToken(username: string, password: string): string {
  const payload = Buffer.from(username, 'utf8').toString('base64url');
  const signature = createHmac('sha256', password).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function isValidAdminSession(token: string | undefined, expectedUser: string, expectedPassword: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expectedSignature = createHmac('sha256', expectedPassword).update(payload).digest('base64url');
  if (!safeEqual(signature, expectedSignature)) return false;
  try {
    return Buffer.from(payload, 'base64url').toString('utf8') === expectedUser;
  } catch {
    return false;
  }
}
