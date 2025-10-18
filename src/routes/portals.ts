import { Hono } from 'hono';
import { getIssuePortalByToken, listIssueSubmissionsForPortal } from '../lib/db';
import type { Env } from '../types/bindings';

export const portalsRoute = new Hono<{ Bindings: Env }>();

portalsRoute.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return c.json({ error: 'Portal token is required' }, 400);
  }

  const portal = await getIssuePortalByToken(c.env, token);
  if (!portal) {
    return c.json({ error: 'Portal not found' }, 404);
  }

  const issueId = portal.issue_id as number;
  const submissions = await listIssueSubmissionsForPortal(c.env, issueId);
  const deadline = portal.submission_deadline as string | null | undefined;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const votingOpen = deadlineDate ? !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() <= Date.now() : false;

  return c.json({
    data: {
      portal: {
        token: portal.token,
        createdAt: portal.created_at,
      },
      issue: {
        id: issueId,
        slug: portal.issue_slug,
        title: portal.issue_title,
        summary: portal.summary,
        guidance: portal.guidance,
        publishAt: portal.publish_at,
        submissionDeadline: deadline,
        status: portal.issue_status,
      },
      voting: {
        isOpen: votingOpen,
        limitPerIp: 5,
      },
      submissions,
    },
  });
});

export default portalsRoute;
