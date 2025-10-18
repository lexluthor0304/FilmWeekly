import { Hono } from 'hono';
import { issueSchema, publishIssueSchema } from '../lib/validation';
import { createIssue, getIssue, listIssues, updateIssueStatus } from '../lib/db';
import type { Env } from '../types/bindings';

export const issuesRoute = new Hono<{ Bindings: Env }>();

issuesRoute.get('/', async (c) => {
  const issues = await listIssues(c.env);
  return c.json({ data: issues });
});

issuesRoute.post('/', async (c) => {
  const payload = await c.req.json();
  const parsed = issueSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'Invalid issue payload', details: parsed.error.flatten() }, 400);
  }

  const issue = await createIssue(c.env, parsed.data);
  return c.json({ data: issue }, 201);
});

issuesRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid issue id' }, 400);
  }

  const issue = await getIssue(c.env, id);
  if (!issue) {
    return c.json({ error: 'Issue not found' }, 404);
  }

  return c.json({ data: issue });
});

issuesRoute.post('/:id/publish', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid issue id' }, 400);
  }

  const payload = await c.req.json();
  const parsed = publishIssueSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'Invalid publish payload', details: parsed.error.flatten() }, 400);
  }

  const issue = await updateIssueStatus(c.env, id, parsed.data);
  return c.json({ data: issue });
});

export default issuesRoute;
