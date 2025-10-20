import type { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  CONFIG_KV: KVNamespace;
  TASK_QUEUE: Queue;
  MODERATION_API_URL: string;
  MODERATION_API_TOKEN: string;
  OTP_PEPPER?: string;
  SESSION_HS256_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
}
