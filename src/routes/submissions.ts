import { Hono } from 'hono';
import type { Context } from 'hono';
import { submissionSchema, reviewDecisionSchema } from '../lib/validation';
import {
  countIpVotesForIssue,
  countSubmissionVotes,
  createSubmission,
  getIssuePortalByToken,
  getSubmission,
  hasIpVotedForSubmission,
  listSubmissions,
  recordReview,
  recordSubmissionVote,
} from '../lib/db';
import { getActor, requireAdmin } from '../lib/middleware';
import type { Env } from '../types/bindings';

export const submissionsRoute = new Hono<{ Bindings: Env; Variables: { actor?: string } }>();

submissionsRoute.get('/', requireAdmin(), async (c) => {
  const searchParams = new URL(c.req.url).searchParams;
  const submissions = await listSubmissions(c.env, searchParams);
  return c.json({ data: submissions });
});

function isAdminRequest(c: Context<{ Bindings: Env; Variables: { actor?: string } }>) {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length).trim();
  return Boolean(token) && token === c.env.ADMIN_API_TOKEN;
}

function getClientIp(c: Context<{ Bindings: Env; Variables: { actor?: string } }>) {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  return null;
}

submissionsRoute.post('/', async (c) => {
  const payload = await c.req.json();
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json({ error: 'Invalid submission payload', details: parsed.error.flatten() }, 400);
  }

  const adminRequest = isAdminRequest(c);
  let issueId = parsed.data.issueId;

  if (!adminRequest) {
    const token = parsed.data.portalToken?.trim();
    if (!token) {
      return c.json({ error: 'Portal token is required for public submissions' }, 403);
    }

    const portal = await getIssuePortalByToken(c.env, token);
    if (!portal) {
      return c.json({ error: 'Portal token not found' }, 404);
    }

    issueId = portal.issue_id as number;

    if (parsed.data.issueId && parsed.data.issueId !== issueId) {
      return c.json({ error: 'Issue mismatch for provided portal' }, 400);
    }

    const deadline = portal.submission_deadline as string | null | undefined;
    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now()) {
        return c.json({ error: 'Submission window has closed for this issue' }, 403);
      }
    }
  }

  const submission = await createSubmission(c.env, {
    issueId,
    title: parsed.data.title,
    authorName: parsed.data.authorName,
    authorContact: parsed.data.authorContact,
    location: parsed.data.location,
    shotAt: parsed.data.shotAt,
    equipment: parsed.data.equipment,
    description: parsed.data.description,
    images: parsed.data.images,
  });
  return c.json({ data: submission }, 201);
});

submissionsRoute.post('/:id/votes', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) {
    return c.json({ error: 'Invalid submission id' }, 400);
  }

  const submission = await getSubmission(c.env, id);
  if (!submission) {
    return c.json({ error: 'Submission not found' }, 404);
  }

  const submissionRecord = submission as Record<string, unknown>;
  const issueId = submissionRecord.issue_id as number | undefined;
  const deadline = submissionRecord.submission_deadline as string | null | undefined;
  const status = submissionRecord.status as string | null | undefined;

  if (!issueId) {
    return c.json({ error: 'Submission is missing issue reference' }, 500);
  }

  if (!deadline) {
    return c.json({ error: 'This issue does not support public voting' }, 400);
  }

  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() > Date.now()) {
    return c.json({ error: 'Voting is not yet available for this submission' }, 403);
  }

  if (status && !['approved', 'published'].includes(status)) {
    return c.json({ error: 'This submission is not eligible for voting' }, 403);
  }

  const voterIp = getClientIp(c);
  if (!voterIp) {
    return c.json({ error: 'Unable to determine client IP for voting' }, 400);
  }

  if (await hasIpVotedForSubmission(c.env, id, voterIp)) {
    return c.json({ error: 'You have already voted for this submission' }, 409);
  }

  const usedVotes = await countIpVotesForIssue(c.env, issueId, voterIp);
  if (usedVotes >= 5) {
    return c.json({ error: 'Vote limit reached for this issue' }, 403);
  }

  const insertedId = await recordSubmissionVote(c.env, id, voterIp);
  if (!insertedId) {
    return c.json({ error: 'Vote has already been recorded' }, 409);
  }

  const totalVotes = await countSubmissionVotes(c.env, id);
  const remainingVotes = Math.max(0, 5 - (usedVotes + 1));

  return c.json({
    data: {
      submissionId: id,
      votes: totalVotes,
      remainingVotes,
    },
  });
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
