import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { issuesRoute } from './routes/issues';
import { submissionsRoute } from './routes/submissions';
import { uploadsRoute } from './routes/uploads';
import type { Env } from './types/bindings';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/', (c) =>
  c.json({
    name: 'FilmWeekly API',
    status: 'ok',
    docs: 'https://github.com/lex/FilmWeekly',
  }),
);

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.route('/api/issues', issuesRoute);
app.route('/api/submissions', submissionsRoute);
app.route('/api/uploads', uploadsRoute);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
