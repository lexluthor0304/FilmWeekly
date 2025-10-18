import { Hono } from 'hono';
import { submissionSchema, reviewDecisionSchema } from '../lib/validation';
import { createSubmission, getSubmission, listSubmissions, recordReview } from '../lib/db';
import { getActor, requireAdmin } from '../lib/middleware';
import type { Env } from '../types/bindings';

export const submissionsRoute = new Hono<{ Bindings: Env; Variables: { actor?: string } }>();

submissionsRoute.get('/', requireAdmin(), async (c) => {
  const searchParams = new URL(c.req.url).searchParams;
  const submissions = await listSubmissions(c.env, searchParams);
  return c.json({ data: submissions });
});

submissionsRoute.post('/', async (c) => {
  const payload = await c.req.json();
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'Invalid submission payload', details: parsed.error.flatten() }, 400);
  }

  const submission = await createSubmission(c.env, parsed.data);
  return c.json({ data: submission }, 201);
});

submissionsRoute.get('/:id', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid submission id' }, 400);
  }

  const submission = await getSubmission(c.env, id);
  if (!submission) {
    return c.json({ error: 'Submission not found' }, 404);
  }

  return c.json({ data: submission });
});

submissionsRoute.post('/:id/review', requireAdmin(), async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid submission id' }, 400);
  }

  const reviewer = getActor(c);
  const payload = await c.req.json();
  const parsed = reviewDecisionSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'Invalid review payload', details: parsed.error.flatten() }, 400);
  }

  const updated = await recordReview(c.env, id, reviewer, parsed.data);
  return c.json({ data: updated });
});

export default submissionsRoute;
