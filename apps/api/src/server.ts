import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { makeDatabase, createRepositories } from '@axplane/db';
import { CreateRequestSchema, CreateRunSchema } from '@axplane/events';
import { getDemoAgentConfig } from '@axplane/agents';

const { db } = makeDatabase();
const repo = createRepositories(db);
const app = new Hono();

app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'] }));

app.get('/health', (c) => c.json({ ok: true, service: 'axplane-api' }));

app.get('/agents', async (c) => c.json(await repo.listAgents()));

app.get('/agents/:id', async (c) => {
  const agent = await repo.getAgent(c.req.param('id'));
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const version = await repo.getCurrentAgentVersion(agent.id);
  return c.json({ ...agent, currentVersion: version });
});

app.post('/agents/seed-demo', async (c) => {
  const config = getDemoAgentConfig();
  const version = await repo.upsertAgent({
    id: config.id,
    name: config.name,
    description: config.description,
    signature: config.signature,
    configJson: config,
  });
  return c.json({ ok: true, version });
});

app.get('/requests', async (c) => c.json(await repo.listRequests()));

app.post('/requests', async (c) => {
  const payload = CreateRequestSchema.parse(await c.req.json());
  const request = await repo.createRequest(payload);
  return c.json(request, 201);
});

app.get('/runs', async (c) => c.json(await repo.listRuns()));

app.post('/runs', async (c) => {
  const payload = CreateRunSchema.parse(await c.req.json());
  const run = await repo.createRun(payload);
  return c.json(run, 201);
});

app.get('/runs/:id', async (c) => {
  const run = await repo.getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'Not found' }, 404);
  const events = await repo.listRunEvents(run.id);
  return c.json({ run, events });
});

app.get('/runs/:id/events', async (c) => {
  const after = c.req.query('afterSeq');
  return c.json(await repo.listRunEvents(c.req.param('id'), after ? Number(after) : undefined));
});

app.get('/runs/:id/stream', async (c) => {
  const runId = c.req.param('id');
  return streamSSE(c, async (stream) => {
    let afterSeq = Number(c.req.query('afterSeq') ?? -1);
    let isClosed = false;
    stream.onAbort(() => { isClosed = true; });

    while (!isClosed) {
      const events = await repo.listRunEvents(runId, afterSeq);
      for (const event of events) {
        afterSeq = event.seq;
        await stream.writeSSE({
          id: String(event.seq),
          data: JSON.stringify(event),
        });
      }
      await stream.sleep(1000);
    }
  });
});

app.post('/runs/:id/cancel', async (c) => {
  const runId = c.req.param('id');
  await repo.updateRunStatus(runId, 'cancelled');
  await repo.appendRunEvent(runId, 'run.cancelled', { reason: 'Cancelled from API' });
  return c.json({ ok: true });
});

app.get('/approvals', async (c) => {
  const status = c.req.query('status');
  return c.json(await repo.listApprovals(status));
});

app.post('/approvals/:id/approve', async (c) => {
  const approval = await repo.resolveApproval(c.req.param('id'), 'approved');
  return c.json(approval);
});

app.post('/approvals/:id/reject', async (c) => {
  const approval = await repo.resolveApproval(c.req.param('id'), 'rejected');
  return c.json(approval);
});

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`AxPlane API listening on http://localhost:${port}`);
