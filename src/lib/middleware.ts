import type { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import { ADMIN_SESSION_COOKIE, hmacSha256, parseSessionCookie, timingSafeEqualHex } from './security';
import {
  getAdminSession,
  revokeAdminSession,
  touchAdminSession,
  type AdminSessionWithUser,
} from './db';
import type { Env } from '../types/bindings';

export type AppContext = Context<{ Bindings: Env; Variables: { actor?: string; adminUserId?: number } }>;

async function getSessionFromCookie(c: AppContext): Promise<AdminSessionWithUser | null> {
  const cookie = getCookie(c, ADMIN_SESSION_COOKIE);
  const parsed = parseSessionCookie(cookie);
  if (!parsed) return null;

  const session = await getAdminSession(c.env, parsed.sessionId);
  if (!session || session.revoked !== 0) {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
    return null;
  }

  const tokenHash = await hmacSha256(
    c.env.SESSION_HS256_SECRET,
    `${parsed.sessionId}|${parsed.token}`,
  );

  const isValid = timingSafeEqualHex(session.token_hash, tokenHash);
  const expired = new Date(session.expires_at).getTime() < Date.now();

  if (!isValid || expired) {
    await revokeAdminSession(c.env, parsed.sessionId);
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
    return null;
  }

  await touchAdminSession(c.env, parsed.sessionId);
  return session;
}

export function requireAdmin() {
  return async (c: AppContext, next: Next) => {
    const session = await getSessionFromCookie(c);
    if (session) {
      c.set('actor', session.user_email ?? 'admin');
      c.set('adminUserId', session.user_id);
      await next();
      return;
    }

    const header = c.req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token || !c.env.ADMIN_API_TOKEN || token !== c.env.ADMIN_API_TOKEN) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const actor = c.req.header('x-admin-actor') ?? 'admin';
    c.set('actor', actor);
    await next();
  };
}

export function getActor(c: AppContext) {
  return c.get('actor') ?? 'system';
}
