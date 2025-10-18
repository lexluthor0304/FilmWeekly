import type { Env } from '../types/bindings';
import type {
  IssueInput,
  PublishIssueInput,
  ReviewDecisionInput,
  SubmissionInput,
} from './validation';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'needs-revision' | 'published';
export type IssueStatus = 'draft' | 'scheduled' | 'published';

export interface SubmissionImageRecord {
  id: number;
  submission_id: number;
  position: number;
  r2_key: string;
  thumbnail_key: string;
  original_name: string;
  size: number;
  width: number | null;
  height: number | null;
  metadata_json: string | null;
}

export interface ModerationResultInput {
  submissionId: number;
  imageId: number | null;
  provider: string;
  verdict: string;
  score?: number;
  reasons?: string[];
  rawResponse?: unknown;
}

export async function logAudit(
  env: Env,
  entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | number | null;
    payload?: unknown;
  },
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO audit_logs (actor, action, entity, entity_id, payload, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      entry.actor,
      entry.action,
      entry.entity,
      entry.entityId != null ? String(entry.entityId) : null,
      entry.payload != null ? JSON.stringify(entry.payload) : null,
      now,
    )
    .run();
}

export async function createSubmission(env: Env, input: SubmissionInput) {
  const now = new Date().toISOString();
  const submission = await env.DB.prepare(
    `INSERT INTO submissions (
      issue_id, title, author_name, author_contact, location, shot_at, equipment, description, status,
      moderation_status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', 'pending', ?9, ?9)
    RETURNING id` ,
  )
    .bind(
      input.issueId,
      input.title,
      input.authorName ?? null,
      input.authorContact ?? null,
      input.location ?? null,
      input.shotAt ?? null,
      input.equipment ?? null,
      input.description ?? null,
      now,
    )
    .first<{ id: number }>();

  if (!submission) throw new Error('Failed to persist submission');

  for (const [index, image] of input.images.entries()) {
    await env.DB.prepare(
      `INSERT INTO submission_images (
        submission_id, position, r2_key, thumbnail_key, original_name, size, width, height, metadata_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)` ,
    )
      .bind(
        submission.id,
        index,
        image.r2Key,
        image.thumbnailKey,
        image.originalName,
        image.size,
        image.width ?? null,
        image.height ?? null,
        image.metadata ? JSON.stringify(image.metadata) : null,
      )
      .run();
  }

  const payload = JSON.stringify({
    type: 'generate-thumbnails' as const,
    submissionId: submission.id,
  });
  const moderationPayload = JSON.stringify({
    type: 'content-moderation' as const,
    submissionId: submission.id,
  });

  await Promise.all([
    env.TASK_QUEUE.send(payload),
    env.TASK_QUEUE.send(moderationPayload),
  ]);

  await logAudit(env, {
    actor: input.authorName ?? 'anonymous-submitter',
    action: 'submission-created',
    entity: 'submission',
    entityId: submission.id,
    payload: { issueId: input.issueId, title: input.title },
  });

  return getSubmission(env, submission.id);
}

export async function getSubmission(env: Env, id: number) {
  const submission = await env.DB.prepare(
    `SELECT s.*, i.guidance, i.title as issue_title
     FROM submissions s
     JOIN issues i ON i.id = s.issue_id
     WHERE s.id = ?1` ,
  )
    .bind(id)
    .first<Record<string, unknown>>();

  if (!submission) return null;

  const images = await env.DB.prepare(
    `SELECT * FROM submission_images WHERE submission_id = ?1 ORDER BY position` ,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  const moderation = await env.DB.prepare(
    `SELECT provider, verdict, score, reasons, raw_response, created_at
     FROM moderation_results
     WHERE submission_id = ?1
     ORDER BY created_at DESC` ,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return {
    ...submission,
    images: images.results ?? [],
    moderation: moderation.results ?? [],
  };
}

export async function listSubmissionImages(env: Env, submissionId: number) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM submission_images WHERE submission_id = ?1 ORDER BY position` ,
  )
    .bind(submissionId)
    .all<SubmissionImageRecord>();
  return results ?? [];
}

export async function updateImageMetadata(
  env: Env,
  imageId: number,
  data: { width?: number | null; height?: number | null },
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submission_images SET width = COALESCE(?2, width), height = COALESCE(?3, height)
     WHERE id = ?1` ,
  )
    .bind(imageId, data.width ?? null, data.height ?? null)
    .run();

  await env.DB.prepare(
    `UPDATE submissions SET updated_at = ?2 WHERE id = (SELECT submission_id FROM submission_images WHERE id = ?1)` ,
  )
    .bind(imageId, now)
    .run();
}

export async function createIssue(env: Env, input: IssueInput, actor: string) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO issues (slug, title, guidance, summary, status, publish_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?6)
     RETURNING *` ,
  )
    .bind(
      input.slug,
      input.title,
      input.guidance,
      input.summary ?? null,
      input.publishAt ?? null,
      now,
    )
    .first<Record<string, unknown>>();

  if (result) {
    await logAudit(env, {
      actor,
      action: 'issue-created',
      entity: 'issue',
      entityId: result.id as number,
      payload: { slug: input.slug, title: input.title },
    });
  }

  return result;
}

export async function listIssues(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, title, guidance, summary, status, publish_at, created_at
     FROM issues
     ORDER BY publish_at DESC NULLS LAST, created_at DESC` ,
  ).all<Record<string, unknown>>();
  return results ?? [];
}

export async function listPublishedIssues(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, title, guidance, summary, publish_at
     FROM issues
     WHERE status = 'published'
     ORDER BY publish_at DESC NULLS LAST, created_at DESC` ,
  ).all<Record<string, unknown>>();
  return results ?? [];
}

export async function getIssue(env: Env, id: number) {
  const issue = await env.DB.prepare(
    `SELECT * FROM issues WHERE id = ?1` ,
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!issue) return null;

  const submissions = await env.DB.prepare(
    `SELECT id, title, author_name, status, moderation_status, created_at
     FROM submissions WHERE issue_id = ?1 ORDER BY created_at DESC` ,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return { ...issue, submissions: submissions.results ?? [] };
}

export async function getIssueBySlug(env: Env, slug: string) {
  const issue = await env.DB.prepare(
    `SELECT * FROM issues WHERE slug = ?1` ,
  )
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!issue) return null;

  const submissions = await env.DB.prepare(
    `SELECT id, title, author_name, description, status, moderation_status
     FROM submissions
     WHERE issue_id = ?1 AND status IN ('approved', 'published')
     ORDER BY created_at ASC` ,
  )
    .bind(issue.id as number)
    .all<Record<string, unknown>>();

  const decorated = [] as Array<Record<string, unknown>>;
  for (const submission of submissions.results ?? []) {
    const images = await env.DB.prepare(
      `SELECT original_name, r2_key, thumbnail_key, width, height
       FROM submission_images
       WHERE submission_id = ?1
       ORDER BY position` ,
    )
      .bind(submission.id as number)
      .all<Record<string, unknown>>();
    decorated.push({ ...submission, images: images.results ?? [] });
  }

  return { ...issue, submissions: decorated };
}

export async function recordReview(
  env: Env,
  submissionId: number,
  reviewer: string,
  input: ReviewDecisionInput,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO review_logs (submission_id, reviewer, decision, notes, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)` ,
  )
    .bind(submissionId, reviewer, input.decision, input.notes ?? null, now)
    .run();

  const status: SubmissionStatus = input.decision === 'approved'
    ? 'approved'
    : input.decision === 'rejected'
      ? 'rejected'
      : 'needs-revision';

  await env.DB.prepare(
    `UPDATE submissions SET status = ?2, updated_at = ?3 WHERE id = ?1` ,
  )
    .bind(submissionId, status, now)
    .run();

  await logAudit(env, {
    actor: reviewer,
    action: 'submission-reviewed',
    entity: 'submission',
    entityId: submissionId,
    payload: { decision: input.decision, notes: input.notes ?? null },
  });

  return getSubmission(env, submissionId);
}

export async function updateIssueStatus(env: Env, id: number, input: PublishIssueInput, actor: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE issues SET status = ?2, publish_at = COALESCE(?3, publish_at), updated_at = ?4 WHERE id = ?1` ,
  )
    .bind(id, input.status, input.publishAt ?? null, now)
    .run();

  await logAudit(env, {
    actor,
    action: 'issue-status-updated',
    entity: 'issue',
    entityId: id,
    payload: { status: input.status, publishAt: input.publishAt ?? null },
  });

  return getIssue(env, id);
}

export async function listSubmissions(env: Env, searchParams: URLSearchParams) {
  const clauses: string[] = [];
  const binds: unknown[] = [];

  let bindIndex = 1;
  const addClause = (clause: string, value: unknown) => {
    clauses.push(clause.replace('?x', `?${bindIndex}`));
    binds.push(value);
    bindIndex += 1;
  };

  if (searchParams.get('status')) {
    addClause('s.status = ?x', searchParams.get('status'));
  }
  if (searchParams.get('issueId')) {
    addClause('s.issue_id = ?x', Number(searchParams.get('issueId')));
  }
  if (searchParams.get('author')) {
    addClause('s.author_name LIKE ?x', `%${searchParams.get('author')}%`);
  }
  if (searchParams.get('location')) {
    addClause('s.location LIKE ?x', `%${searchParams.get('location')}%`);
  }
  if (searchParams.get('moderationStatus')) {
    addClause('s.moderation_status = ?x', searchParams.get('moderationStatus'));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `SELECT s.id, s.title, s.author_name, s.status, s.moderation_status, s.created_at, i.title as issue_title
    FROM submissions s
    JOIN issues i ON i.id = s.issue_id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT 100`;

  let statement = env.DB.prepare(query);
  if (binds.length) {
    statement = statement.bind(...binds as unknown[]);
  }

  const { results } = await statement.all<Record<string, unknown>>();
  return results ?? [];
}

export async function saveModerationResult(env: Env, input: ModerationResultInput) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO moderation_results (submission_id, image_id, provider, verdict, score, reasons, raw_response, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)` ,
  )
    .bind(
      input.submissionId,
      input.imageId,
      input.provider,
      input.verdict,
      input.score ?? null,
      input.reasons ? input.reasons.join(', ') : null,
      input.rawResponse ? JSON.stringify(input.rawResponse) : null,
      now,
    )
    .run();
}

export async function updateSubmissionModeration(
  env: Env,
  submissionId: number,
  status: string,
  summary: string,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submissions SET moderation_status = ?2, moderation_summary = ?3, updated_at = ?4 WHERE id = ?1` ,
  )
    .bind(submissionId, status, summary, now)
    .run();

  await logAudit(env, {
    actor: 'system',
    action: 'submission-moderated',
    entity: 'submission',
    entityId: submissionId,
    payload: { status, summary },
  });
}

export async function markSubmissionPublished(env: Env, submissionId: number) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submissions SET status = 'published', updated_at = ?2 WHERE id = ?1` ,
  )
    .bind(submissionId, now)
    .run();

  await logAudit(env, {
    actor: 'system',
    action: 'submission-published',
    entity: 'submission',
    entityId: submissionId,
  });
}

export async function listRecentAuditLogs(env: Env, limit = 50) {
  const { results } = await env.DB.prepare(
    `SELECT actor, action, entity, entity_id, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT ?1` ,
  )
    .bind(limit)
    .all<Record<string, unknown>>();

  return results ?? [];
}
