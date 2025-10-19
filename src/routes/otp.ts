import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  createAdminSession,
  createOtpChallenge,
  consumeOtpChallenge,
  getAdminSession,
  getAdminUserByEmail,
  getLatestOtpChallenge,
  incrementOtpAttempt,
  logAudit,
  revokeAdminSession,
  touchAdminSession,
  updateAdminLastLogin,
} from '../lib/db';
import { sendOtpEmail } from '../lib/email';
import {
  ADMIN_SESSION_COOKIE,
  buildSessionCookieValue,
  generateNumericCode,
  generateSessionSecret,
  hmacSha256,
  parseSessionCookie,
  timingSafeEqualHex,
} from '../lib/security';
import type { Env } from '../types/bindings';

type OtpContext = Context<{ Bindings: Env }>;

const otpRoute = new Hono<{ Bindings: Env }>();

const emailSchema = z.object({
  email: z.string().trim().min(1).max(320).email(),
});

const verifySchema = emailSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/),
});

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getClientIp(c: OtpContext) {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
}

function getUserAgent(c: OtpContext) {
  return c.req.header('user-agent') ?? null;
}

async function fakeHash(env: Env) {
  await hmacSha256(env.OTP_PEPPER, crypto.randomUUID());
}

otpRoute.post('/request', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}));
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid email address' }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const user = await getAdminUserByEmail(c.env, email);

  if (!user) {
    await fakeHash(c.env);
    return c.json({ ok: true });
  }

  const existingChallenge = await getLatestOtpChallenge(c.env, user.id);
  if (existingChallenge && existingChallenge.consumed === 0) {
    const expires = new Date(existingChallenge.expires_at).getTime();
    if (expires > Date.now()) {
      // Enforce simple cooldown of 60 seconds between requests.
      const createdAt = new Date(existingChallenge.created_at).getTime();
      if (Date.now() - createdAt < 60 * 1000) {
        return c.json({ ok: true });
      }
    }
  }

  const code = generateNumericCode(OTP_LENGTH);
  const challengeId = crypto.randomUUID();
  const codeHash = await hmacSha256(c.env.OTP_PEPPER, `${user.id}|${code}|${challengeId}`);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await createOtpChallenge(c.env, {
    userId: user.id,
    challengeId,
    codeHash,
    expiresAt,
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  await sendOtpEmail(c.env, email, code);

  return c.json({ ok: true });
});

otpRoute.post('/verify', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({}));
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const code = parsed.data.code;
  const user = await getAdminUserByEmail(c.env, email);

  if (!user) {
    await fakeHash(c.env);
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const challenge = await getLatestOtpChallenge(c.env, user.id);
  if (!challenge) {
    await fakeHash(c.env);
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  if (challenge.consumed !== 0) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  if (challenge.attempt_count >= OTP_MAX_ATTEMPTS) {
    await consumeOtpChallenge(c.env, challenge.challenge_id);
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const now = Date.now();
  const expiresAt = new Date(challenge.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    await consumeOtpChallenge(c.env, challenge.challenge_id);
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const computedHash = await hmacSha256(c.env.OTP_PEPPER, `${user.id}|${code}|${challenge.challenge_id}`);
  const isValid = timingSafeEqualHex(challenge.code_hash, computedHash);

  if (!isValid) {
    const attempt = await incrementOtpAttempt(c.env, challenge.challenge_id);
    if (!attempt || attempt.attempt_count >= OTP_MAX_ATTEMPTS) {
      await consumeOtpChallenge(c.env, challenge.challenge_id);
    }
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  await consumeOtpChallenge(c.env, challenge.challenge_id);
  await updateAdminLastLogin(c.env, user.id);

  const secret = generateSessionSecret();
  const tokenHash = await hmacSha256(
    c.env.SESSION_HS256_SECRET,
    `${secret.sessionId}|${secret.token}`,
  );
  const expiresAtIso = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await createAdminSession(c.env, {
    userId: user.id,
    sessionId: secret.sessionId,
    tokenHash,
    expiresAt: expiresAtIso,
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });

  const cookieValue = buildSessionCookieValue(secret);
  setCookie(c, ADMIN_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  await logAudit(c.env, {
    actor: email,
    action: 'admin-login',
    entity: 'admin-session',
    entityId: secret.sessionId,
  });

  return c.json({ ok: true });
});

otpRoute.post('/logout', async (c) => {
  const cookie = getCookie(c, ADMIN_SESSION_COOKIE);
  const parsed = parseSessionCookie(cookie);
  if (parsed) {
    await revokeAdminSession(c.env, parsed.sessionId);
    await logAudit(c.env, {
      actor: 'admin',
      action: 'admin-logout',
      entity: 'admin-session',
      entityId: parsed.sessionId,
    });
  }

  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

otpRoute.get('/session', async (c) => {
  const cookie = getCookie(c, ADMIN_SESSION_COOKIE);
  const parsed = parseSessionCookie(cookie);
  if (!parsed) {
    return c.json({ data: null });
  }

  const session = await getAdminSession(c.env, parsed.sessionId);
  if (!session || session.revoked !== 0) {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
    return c.json({ data: null });
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
    return c.json({ data: null });
  }

  await touchAdminSession(c.env, parsed.sessionId);

  return c.json({
    data: {
      sessionId: session.session_id,
      userId: session.user_id,
      email: session.user_email,
      name: session.user_name,
      expiresAt: session.expires_at,
    },
  });
});

export default otpRoute;
