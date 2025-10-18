import type { Context, Next } from 'hono';
import type { Env } from '../types/bindings';

export type AppContext = Context<{ Bindings: Env; Variables: { actor?: string } }>;

export function requireAdmin() {
  return async (c: AppContext, next: Next) => {
    const header = c.req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token || token !== c.env.ADMIN_API_TOKEN) {
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
