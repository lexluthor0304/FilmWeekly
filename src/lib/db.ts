import type { Env } from '../types/bindings';
import type { IssueInput, PublishIssueInput, ReviewDecisionInput, SubmissionInput } from './validation';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'needs-revision' | 'published';
export type IssueStatus = 'draft' | 'scheduled' | 'published';

export async function createSubmission(env: Env, input: SubmissionInput) {
  const now = new Date().toISOString();
  const submission = await env.DB.prepare(
    `INSERT INTO submissions (
      issue_id, title, author_name, author_contact, location, shot_at, equipment, description, status, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9)
    RETURNING id`
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
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
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

  await env.TASK_QUEUE.send(
    JSON.stringify({
      type: 'generate-thumbnails',
      submissionId: submission.id,
    }),
  );

  return getSubmission(env, submission.id);
}

export async function getSubmission(env: Env, id: number) {
  const submission = await env.DB.prepare(
    `SELECT s.*, i.guidance
     FROM submissions s
     JOIN issues i ON i.id = s.issue_id
     WHERE s.id = ?1`
  )
    .bind(id)
    .first<Record<string, unknown>>();

  if (!submission) return null;

  const images = await env.DB.prepare(
    `SELECT * FROM submission_images WHERE submission_id = ?1 ORDER BY position`
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return { ...submission, images: images.results ?? [] };
}

export async function createIssue(env: Env, input: IssueInput) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO issues (slug, title, guidance, summary, status, publish_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?6)
     RETURNING *`
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

  return result;
}

export async function listIssues(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, title, guidance, status, publish_at, created_at
     FROM issues
     ORDER BY publish_at DESC NULLS LAST, created_at DESC`
  ).all<Record<string, unknown>>();
  return results ?? [];
}

export async function getIssue(env: Env, id: number) {
  const issue = await env.DB.prepare(
    `SELECT * FROM issues WHERE id = ?1`
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!issue) return null;

  const submissions = await env.DB.prepare(
    `SELECT id, title, author_name, status, created_at
     FROM submissions WHERE issue_id = ?1 ORDER BY created_at DESC`
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return { ...issue, submissions: submissions.results ?? [] };
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
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(submissionId, reviewer, input.decision, input.notes ?? null, now)
    .run();

  const status: SubmissionStatus = input.decision === 'approved'
    ? 'approved'
    : input.decision === 'rejected'
      ? 'rejected'
      : 'needs-revision';

  await env.DB.prepare(
    `UPDATE submissions SET status = ?2, updated_at = ?3 WHERE id = ?1`
  )
    .bind(submissionId, status, now)
    .run();

  return getSubmission(env, submissionId);
}

export async function updateIssueStatus(env: Env, id: number, input: PublishIssueInput) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE issues SET status = ?2, publish_at = COALESCE(?3, publish_at), updated_at = ?4 WHERE id = ?1`
  )
    .bind(id, input.status, input.publishAt ?? null, now)
    .run();

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

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const query = `SELECT s.id, s.title, s.author_name, s.status, s.created_at, i.title as issue_title
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
