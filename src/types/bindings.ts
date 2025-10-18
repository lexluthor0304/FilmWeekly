import type { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  CONFIG_KV: KVNamespace;
  TASK_QUEUE: Queue;
}
