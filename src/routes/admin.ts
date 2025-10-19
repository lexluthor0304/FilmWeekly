import { Hono } from 'hono';
import { listRecentAuditLogs } from '../lib/db';
import { requireAdmin, getActor } from '../lib/middleware';
import type { Env } from '../types/bindings';

export const adminRoute = new Hono<{ Bindings: Env; Variables: { actor?: string; adminUserId?: number } }>();

adminRoute.get('/audit-logs', requireAdmin(), async (c) => {
  const limit = Number(new URL(c.req.url).searchParams.get('limit') ?? '50');
  const logs = await listRecentAuditLogs(c.env, Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 200));
  return c.json({ data: logs });
});

adminRoute.get('/me', requireAdmin(), (c) => {
  const adminUserId = c.get('adminUserId');
  return c.json({ data: { actor: getActor(c), adminUserId: adminUserId ?? null } });
});

export default adminRoute;
