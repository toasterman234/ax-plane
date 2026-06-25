import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { makeDatabase, createRepositories } from '@axplane/db';
import { CreateRequestSchema, CreateRunSchema } from '@axplane/events';
import {
  AgentMetadataUpdateSchema,
  SaveAgentVersionSchema,
  demoToolDescriptors,
  getDemoAgentConfig,
  parseAgentConfigJson,
} from '@axplane/agents';
import { manualOverrideDecision, routeRequest } from '@axplane/router';
import { readWorkerHealth } from '@axplane/runtime-dev';

const { db } = makeDatabase();
const repo = createRepositories(db);
const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
}));

async function classifyRequest(body: string, explicitAgentId?: string) {
  const agents = await repo.listRoutableAgents();
  return routeRequest({ body, agents, explicitAgentId });
}

app.get('/health', (c) => {
  const worker = readWorkerHealth(Number(process.env.WORKER_HEARTBEAT_STALE_MS ?? 10_000));
  return c.json({
    ok: true,
    service: 'axplane-api',
    worker,
  });
});

app.get('/tools', (c) => c.json(demoToolDescriptors));

app.get('/agents', async (c) => c.json(await repo.listAgents()));

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

app.get('/agents/:id', async (c) => {
  const agent = await repo.getAgent(c.req.param('id'));
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const currentVersion = await repo.getCurrentAgentVersion(agent.id);
  return c.json({ ...agent, currentVersion });
});

app.get('/agents/:id/versions', async (c) => {
  const agent = await repo.getAgent(c.req.param('id'));
  if (!agent) return c.json({ error: 'Not found' }, 404);
  return c.json(await repo.listAgentVersions(agent.id));
});

app.patch('/agents/:id', async (c) => {
  const agent = await repo.getAgent(c.req.param('id'));
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const patch = AgentMetadataUpdateSchema.parse(await c.req.json());
  const updated = await repo.updateAgent(agent.id, patch);
  return c.json(updated);
});

app.post('/agents/:id/versions', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const body = SaveAgentVersionSchema.parse(await c.req.json());
  const configJson = parseAgentConfigJson({ ...body, id: agentId });
  const version = await repo.saveAgentVersion(agentId, {
    signature: configJson.signature,
    configJson,
  });
  const updatedAgent = await repo.getAgent(agentId);
  return c.json({ agent: updatedAgent, version }, 201);
});

app.get('/requests', async (c) => c.json(await repo.listRequests()));

app.get('/requests/:id', async (c) => {
  const request = await repo.getRequest(c.req.param('id'));
  if (!request) return c.json({ error: 'Not found' }, 404);
  return c.json(request);
});

app.post('/requests', async (c) => {
  const payload = CreateRequestSchema.parse(await c.req.json());
  const routeDecision = await classifyRequest(payload.body, payload.agentId);
  const request = await repo.createRequest({
    body: payload.body,
    agentId: routeDecision.selectedAgentId,
    routeDecision,
  });
  if (payload.autoStart) {
    const run = await repo.createRun({ requestId: request.id, agentId: routeDecision.selectedAgentId });
    return c.json({ request, run, routeDecision }, 201);
  }
  return c.json({ request, routeDecision }, 201);
});

const RerouteRequestSchema = z.object({
  agentId: z.string().min(1).optional(),
});

app.post('/requests/:id/route', async (c) => {
  const request = await repo.getRequest(c.req.param('id'));
  if (!request) return c.json({ error: 'Not found' }, 404);
  const payload = RerouteRequestSchema.parse(await c.req.json().catch(() => ({})));

  let routeDecision;
  if (payload.agentId && payload.agentId !== request.agentId) {
    routeDecision = manualOverrideDecision({
      previousAgentId: request.agentId,
      selectedAgentId: payload.agentId,
      reason: `Manual override: ${request.agentId} → ${payload.agentId}`,
    });
    const agents = await repo.listRoutableAgents();
    if (!agents.some((agent) => agent.id === payload.agentId)) {
      return c.json({ error: 'Agent not found or disabled' }, 400);
    }
  } else if (payload.agentId) {
    routeDecision = await classifyRequest(request.body, payload.agentId);
  } else {
    routeDecision = await classifyRequest(request.body);
  }

  const updated = await repo.updateRequestRoute(request.id, routeDecision, routeDecision.selectedAgentId);
  return c.json({ request: updated, routeDecision });
});

app.get('/runs', async (c) => c.json(await repo.listRuns()));

app.post('/runs', async (c) => {
  const payload = CreateRunSchema.parse(await c.req.json());
  const request = await repo.getRequest(payload.requestId);
  if (!request) return c.json({ error: 'Request not found' }, 404);

  const agentId = payload.agentId ?? request.agentId;
  if (agentId !== request.agentId) {
    const routeDecision = manualOverrideDecision({
      previousAgentId: request.agentId,
      selectedAgentId: agentId,
      reason: `Run started with manual agent override (${request.agentId} → ${agentId})`,
    });
    await repo.updateRequestRoute(request.id, routeDecision, agentId);
  }

  const run = await repo.createRun({ requestId: payload.requestId, agentId });
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

const port = Number(process.env.API_PORT ?? 8797);
serve({ fetch: app.fetch, port });
console.log(`AxPlane API listening on http://localhost:${port}`);
