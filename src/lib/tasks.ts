import {
  listSubmissionImages,
  logAudit,
  saveModerationResult,
  updateImageMetadata,
  updateSubmissionModeration,
} from './db';
import type { Env } from '../types/bindings';

interface QueueMessageBase {
  type: string;
}

export interface ThumbnailTask extends QueueMessageBase {
  type: 'generate-thumbnails';
  submissionId: number;
}

export interface ModerationTask extends QueueMessageBase {
  type: 'content-moderation';
  submissionId: number;
}

export type QueueTask = ThumbnailTask | ModerationTask;

async function writeThumbnail(
  env: Env,
  image: { id: number; r2_key: string; thumbnail_key: string },
) {
  const object = await env.R2_BUCKET.get(image.r2_key);
  if (!object) {
    await logAudit(env, {
      actor: 'system',
      action: 'thumbnail-source-missing',
      entity: 'submission-image',
      entityId: image.id,
      payload: { key: image.r2_key },
    });
    return;
  }

  const arrayBuffer = await object.arrayBuffer();
  const blob = new Blob([arrayBuffer], {
    type: object.httpMetadata?.contentType ?? 'application/octet-stream',
  });

  let width: number | null = null;
  let height: number | null = null;
  let outputBuffer = arrayBuffer;
  let contentType = blob.type || 'image/webp';

  try {
    const bitmap = await createImageBitmap(blob);
    width = bitmap.width;
    height = bitmap.height;

    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

    if (scale < 1) {
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to obtain 2D context for OffscreenCanvas');
      }
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const thumbnailBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
      outputBuffer = await thumbnailBlob.arrayBuffer();
      contentType = thumbnailBlob.type || 'image/webp';
    } else if (!contentType.includes('image/')) {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to create fallback 2D context for thumbnail');
      }
      ctx.drawImage(bitmap, 0, 0);
      const normalized = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
      outputBuffer = await normalized.arrayBuffer();
      contentType = normalized.type || 'image/webp';
    }
  } catch (error) {
    await logAudit(env, {
      actor: 'system',
      action: 'thumbnail-conversion-failed',
      entity: 'submission-image',
      entityId: image.id,
      payload: { message: (error as Error).message },
    });
  }

  await env.R2_BUCKET.put(image.thumbnail_key, outputBuffer, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  await updateImageMetadata(env, image.id, { width, height });
}

export async function handleThumbnailTask(env: Env, submissionId: number) {
  const images = await listSubmissionImages(env, submissionId);
  for (const image of images) {
    await writeThumbnail(env, image);
  }

  await logAudit(env, {
    actor: 'system',
    action: 'thumbnails-generated',
    entity: 'submission',
    entityId: submissionId,
    payload: { imageCount: images.length },
  });
}

export async function handleModerationTask(env: Env, submissionId: number) {
  const images = await listSubmissionImages(env, submissionId);
  const verdicts: string[] = [];
  const reasons: string[] = [];

  for (const image of images) {
    const object = await env.R2_BUCKET.get(image.r2_key);
    if (!object) {
      await saveModerationResult(env, {
        submissionId,
        imageId: image.id,
        provider: 'external',
        verdict: 'error',
        reasons: ['missing-source'],
      });
      verdicts.push('error');
      continue;
    }

    let response: Response;
    try {
      response = await fetch(env.MODERATION_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MODERATION_API_TOKEN}`,
          'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          'X-R2-Key': image.r2_key,
        },
        body: await object.arrayBuffer(),
      });
    } catch (error) {
      await saveModerationResult(env, {
        submissionId,
        imageId: image.id,
        provider: 'external',
        verdict: 'error',
        reasons: ['network-error'],
        rawResponse: { message: (error as Error).message },
      });
      verdicts.push('error');
      continue;
    }

    if (!response.ok) {
      await saveModerationResult(env, {
        submissionId,
        imageId: image.id,
        provider: 'external',
        verdict: 'error',
        reasons: [`http-${response.status}`],
      });
      verdicts.push('error');
      continue;
    }

    const result = (await response.json()) as {
      verdict: string;
      score?: number;
      reasons?: string[];
      summary?: string;
    };

    await saveModerationResult(env, {
      submissionId,
      imageId: image.id,
      provider: 'external',
      verdict: result.verdict,
      score: result.score,
      reasons: result.reasons,
      rawResponse: result,
    });

    verdicts.push(result.verdict);
    if (Array.isArray(result.reasons)) {
      reasons.push(...result.reasons);
    }
  }

  const finalVerdict = determineSubmissionVerdict(verdicts);
  const summary = reasons.length
    ? `${finalVerdict} • ${Array.from(new Set(reasons)).join(', ')}`
    : finalVerdict;

  await updateSubmissionModeration(env, submissionId, finalVerdict, summary);
}

function determineSubmissionVerdict(verdicts: string[]) {
  if (verdicts.some((v) => v === 'rejected' || v === 'blocked')) {
    return 'rejected';
  }
  if (verdicts.some((v) => v === 'manual-review' || v === 'flagged' || v === 'error')) {
    return 'manual-review';
  }
  return verdicts.length ? 'approved' : 'manual-review';
}
