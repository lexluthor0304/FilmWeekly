import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { issuesRoute } from './routes/issues';
import { submissionsRoute } from './routes/submissions';
import { uploadsRoute } from './routes/uploads';
import { portalsRoute } from './routes/portals';
import pagesRoute from './routes/pages';
import adminRoute from './routes/admin';
import { handleModerationTask, handleThumbnailTask } from './lib/tasks';
import type { Env } from './types/bindings';
import type { QueueTask } from './lib/tasks';

interface QueueMessage<T = unknown> {
  body: string;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
  timestamp?: number;
}

interface MessageBatch<T = unknown> {
  queue: string;
  messages: Array<QueueMessage<T>>;
}

const app = new Hono<{ Bindings: Env; Variables: { actor?: string } }>();

app.use('/api/*', cors());

app.route('/', pagesRoute);

app.get('/api', (c) =>
  c.json({
    name: 'FilmWeekly API',
    status: 'ok',
    docs: 'https://github.com/lex/FilmWeekly',
  }),
);

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.get('/media/*', async (c) => {
  const path = c.req.path.substring('/media/'.length);
  if (!path) {
    return c.json({ error: 'Missing asset key' }, 400);
  }
  const key = path
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');

  const object = await c.env.R2_BUCKET.get(key);
  if (!object) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  if (object.size !== undefined) {
    headers.set('Content-Length', object.size.toString());
  }
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  if (!object.body) {
    return new Response(null, { headers });
  }

  return new Response(object.body as unknown as ReadableStream, { headers });
});

app.route('/api/issues', issuesRoute);
app.route('/api/submissions', submissionsRoute);
app.route('/api/uploads', uploadsRoute);
app.route('/api/portals', portalsRoute);
app.route('/api/admin', adminRoute);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

async function processQueue(batch: MessageBatch<QueueTask>, env: Env, _ctx: ExecutionContext) {
  for (const message of batch.messages) {
    try {
      const raw = JSON.parse(message.body) as Partial<QueueTask> | null;
      if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
        console.warn('Unknown queue payload shape', raw);
        message.ack();
        continue;
      }

      const payload = raw as QueueTask;
      const taskType = payload.type;
      switch (taskType) {
        case 'generate-thumbnails':
          await handleThumbnailTask(env, payload.submissionId);
          break;
        case 'content-moderation':
          await handleModerationTask(env, payload.submissionId);
          break;
        default:
          console.warn('Unknown queue task type', taskType);
          message.ack();
          continue;
      }
      message.ack();
    } catch (error) {
      console.error('Failed to process queue message', error);
      message.retry({ delaySeconds: 30 });
    }
  }
}

const worker = {
  fetch: app.fetch,
  queue: processQueue,
};

export default worker;
