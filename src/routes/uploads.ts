import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import type { Env } from '../types/bindings';

interface InitiatePayload {
  filename: string;
  contentType?: string;
  size: number;
}

interface CompletePayload {
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
}

export const uploadsRoute = new Hono<{ Bindings: Env }>();

uploadsRoute.post('/initiate', async (c) => {
  const payload = await c.req.json<InitiatePayload>();
  if (!payload?.filename || !payload.size || payload.size < 10 * 1024 * 1024) {
    return c.json({ error: 'File must be at least 10MB and include filename/size' }, 400);
  }

  const objectKey = `${new Date().getUTCFullYear()}/${uuidv4()}-${payload.filename}`;
  const multipart = await c.env.R2_BUCKET.createMultipartUpload(objectKey, {
    httpMetadata: {
      contentType: payload.contentType ?? 'application/octet-stream',
    },
  });

  await c.env.CONFIG_KV.put(
    `upload:${multipart.uploadId}`,
    JSON.stringify({ key: objectKey, size: payload.size, createdAt: Date.now() }),
    { expirationTtl: 60 * 60 * 24 },
  );

  return c.json({
    data: {
      key: objectKey,
      uploadId: multipart.uploadId,
      uploadType: 'multipart',
      partSizeHint: 20 * 1024 * 1024,
    },
  });
});

uploadsRoute.post('/complete', async (c) => {
  const payload = await c.req.json<CompletePayload>();
  if (!payload?.uploadId || !payload.key || !Array.isArray(payload.parts) || payload.parts.length === 0) {
    return c.json({ error: 'Invalid completion payload' }, 400);
  }

  const multipart = await c.env.R2_BUCKET.resumeMultipartUpload(payload.key, payload.uploadId);
  if (!multipart) {
    return c.json({ error: 'Upload session not found or expired' }, 404);
  }

  await multipart.complete(
    payload.parts.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag,
    })),
  );

  await c.env.CONFIG_KV.delete(`upload:${payload.uploadId}`);

  return c.json({ data: { key: payload.key, uploadId: payload.uploadId } });
});

export default uploadsRoute;
