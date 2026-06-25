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
  CreateAgentSchema,
  DuplicateAgentSchema,
  AgentConfigSchema,
  buildDemoTemplateAgentConfig,
  buildStarterAgentConfig,
  cloneAgentConfigForDuplicate,
  demoToolDescriptors,
  getDemoAgentConfig,
  parseAgentConfigJson,
} from '@axplane/agents';
import { manualOverrideDecision, resolveRouterMode, routeRequest, routeRequestAsync } from '@axplane/router';
import { readWorkerHealth } from '@axplane/runtime-dev';
import { runAgentForConfig } from '@axplane/runtime';
import { DEMO_EVAL_SUITE, executeEvalRun, type EvalRunSummary } from '@axplane/eval';
import {
  buildEvalComparison,
  executeOptimizationWorkflow,
  metricsFromEvalRun,
  type LabRepository,
} from '@axplane/lab';
import { DEMO_GRAPH_WORKFLOW, GRAPH_DEMO_AGENTS } from '@axplane/graph';
import type { HostToolDefinition } from '@axplane/host-tools';

const CreateHttpToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/, 'Tool name must be lowercase slug (e.g. slack_notify)'),
  description: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).default('POST'),
  urlTemplate: z.string().min(8),
  risk: z.enum(['safe', 'risky']).default('risky'),
  headers: z.record(z.string()).optional(),
  bodyTemplate: z.string().optional(),
});

function toToolDescriptor(tool: HostToolDefinition) {
  return {
    qualifiedName: tool.qualifiedName,
    namespace: tool.namespace,
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    args: tool.parameters,
    custom: tool.namespace === 'http',
  };
}

async function listAllToolDescriptors() {
  const custom = await repo.listCustomTools();
  return [...demoToolDescriptors, ...custom.map(toToolDescriptor)];
}

const { db } = makeDatabase();
const repo = createRepositories(db);
const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    return c.json({ error: 'Validation failed', issues: err.issues }, 400);
  }
  if (err instanceof Error) {
    if (err.message.startsWith('Eval suite not found:')) {
      return c.json({ error: err.message }, 404);
    }
    if (err.message.startsWith('No agent version for')) {
      return c.json({ error: err.message }, 404);
    }
    console.error(err);
    return c.json({ error: err.message }, 500);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

async function classifyRequest(body: string, explicitAgentId?: string) {
  const agents = await repo.listRoutableAgents();
  const mode = process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock';
  return routeRequestAsync({
    body,
    agents,
    explicitAgentId,
    mode,
    routerMode: resolveRouterMode(),
  });
}

app.get('/health', (c) => {
  const worker = readWorkerHealth(Number(process.env.WORKER_HEARTBEAT_STALE_MS ?? 10_000));
  return c.json({
    ok: true,
    service: 'axplane-api',
    worker,
    router: {
      mode: resolveRouterMode(),
      executionMode: process.env.AXPLANE_EXECUTION_MODE === 'real' ? 'real' : 'mock',
    },
  });
});

app.get('/tools', async (c) => c.json(await listAllToolDescriptors()));

app.post('/tools', async (c) => {
  const payload = CreateHttpToolSchema.parse(await c.req.json());
  try {
    const tool = await repo.createCustomHttpTool(payload);
    return c.json(toToolDescriptor(tool), 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Custom tool already exists:')) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

app.delete('/tools/:qualifiedName', async (c) => {
  const qualifiedName = decodeURIComponent(c.req.param('qualifiedName'));
  const deleted = await repo.deleteCustomTool(qualifiedName);
  if (!deleted) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true, qualifiedName });
});

const CreateMemorySchema = z.object({
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  agentId: z.string().min(1).nullable().optional(),
});

const EvalCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run_completed') }),
  z.object({ type: z.literal('run_status'), status: z.enum(['queued', 'running', 'needs_approval', 'completed', 'failed', 'cancelled']) }),
  z.object({ type: z.literal('output_contains'), field: z.string().optional(), text: z.string(), caseInsensitive: z.boolean().optional() }),
  z.object({ type: z.literal('tool_called'), qualifiedName: z.string() }),
  z.object({ type: z.literal('event_type'), eventType: z.string() }),
]);

const CreateEvalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  agentId: z.string().min(1).optional(),
  cases: z.array(z.object({
    name: z.string().min(1),
    taskText: z.string().min(1),
    criteria: z.array(EvalCriterionSchema).min(1),
    sortOrder: z.number().int().optional(),
  })).min(1),
});

const CreateEvalRunSchema = z.object({
  suiteId: z.string().uuid(),
  agentId: z.string().min(1),
  agentVersionId: z.string().uuid().optional(),
  mode: z.enum(['mock', 'real']).default('mock'),
});

const OptimizeAgentSchema = z.object({
  suiteId: z.string().uuid(),
  mode: z.enum(['mock', 'real']).default('mock'),
  optimizerType: z.enum(['ax-native-mock', 'ax-native']).default('ax-native-mock'),
  optimizerConfig: z.object({
    maxMetricCalls: z.number().int().min(1).max(100).optional(),
    verbose: z.boolean().optional(),
  }).optional(),
});

async function loadAgentConfig(agentId: string) {
  const version = await repo.getCurrentAgentVersion(agentId);
  if (!version?.configJson) throw new Error(`No agent version for ${agentId}`);
  return parseAgentConfigJson(version.configJson);
}

async function comparisonFromEvalRuns(baselineEvalRunId: string, candidateEvalRunId: string) {
  const baselineRun = await repo.getEvalRun(baselineEvalRunId);
  const candidateRun = await repo.getEvalRun(candidateEvalRunId);
  if (!baselineRun?.summaryJson || !candidateRun?.summaryJson) {
    throw new Error('Both eval runs must be completed with summaries');
  }

  const baselineSnapshots = await Promise.all(
    (baselineRun.results ?? []).map(async (result) => {
      if (!result.runId) return { runId: null, events: [], toolCalls: [], usageRows: [] };
      return {
        runId: result.runId,
        events: await repo.listRunEvents(result.runId),
        toolCalls: await repo.listToolCallsForRun(result.runId),
        usageRows: await repo.listModelUsageForRun(result.runId),
      };
    }),
  );
  const candidateSnapshots = await Promise.all(
    (candidateRun.results ?? []).map(async (result) => {
      if (!result.runId) return { runId: null, events: [], toolCalls: [], usageRows: [] };
      return {
        runId: result.runId,
        events: await repo.listRunEvents(result.runId),
        toolCalls: await repo.listToolCallsForRun(result.runId),
        usageRows: await repo.listModelUsageForRun(result.runId),
      };
    }),
  );

  const baseline = metricsFromEvalRun(
    baselineEvalRunId,
    baselineRun.summaryJson as EvalRunSummary,
    baselineSnapshots,
  );
  const candidate = metricsFromEvalRun(
    candidateEvalRunId,
    candidateRun.summaryJson as EvalRunSummary,
    candidateSnapshots,
  );
  return buildEvalComparison(baseline, candidate);
}

app.get('/memory', async (c) => {
  const agentId = c.req.query('agentId');
  const query = c.req.query('query');
  const limit = c.req.query('limit');
  return c.json(await repo.listMemoryEntries({
    agentId: agentId === 'global' ? 'global' : agentId || undefined,
    query: query || undefined,
    limit: limit ? Number(limit) : undefined,
  }));
});

app.post('/memory', async (c) => {
  const payload = CreateMemorySchema.parse(await c.req.json());
  const entry = await repo.createMemoryEntry({
    agentId: payload.agentId ?? null,
    runId: null,
    content: payload.content,
    tags: payload.tags,
  });
  return c.json(entry, 201);
});

app.get('/eval/suites', async (c) => c.json(await repo.listEvalSuites()));

app.post('/eval/suites/seed-demo', async (c) => {
  const existing = await repo.listEvalSuites();
  const found = existing.find((suite) => suite.name === DEMO_EVAL_SUITE.name);
  if (found) return c.json(found);
  const suite = await repo.createEvalSuite({
    name: DEMO_EVAL_SUITE.name,
    description: DEMO_EVAL_SUITE.description,
    cases: DEMO_EVAL_SUITE.cases.map((row) => ({
      name: row.name,
      taskText: row.taskText,
      criteria: row.criteria,
      sortOrder: row.sortOrder,
    })),
  });
  return c.json(suite, 201);
});

app.post('/eval/suites', async (c) => {
  const payload = CreateEvalSuiteSchema.parse(await c.req.json());
  const suite = await repo.createEvalSuite(payload);
  return c.json(suite, 201);
});

app.get('/eval/suites/:id', async (c) => {
  const suite = await repo.getEvalSuite(c.req.param('id'));
  if (!suite) return c.json({ error: 'Not found' }, 404);
  return c.json(suite);
});

app.get('/eval/runs', async (c) => {
  const suiteId = c.req.query('suiteId');
  return c.json(await repo.listEvalRuns(suiteId || undefined));
});

app.get('/eval/runs/:id', async (c) => {
  const evalRun = await repo.getEvalRun(c.req.param('id'));
  if (!evalRun) return c.json({ error: 'Not found' }, 404);
  return c.json(evalRun);
});

app.post('/eval/runs', async (c) => {
  const payload = CreateEvalRunSchema.parse(await c.req.json());
  const agent = await repo.getAgent(payload.agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const suite = await repo.getEvalSuite(payload.suiteId);
  if (!suite) return c.json({ error: `Eval suite not found: ${payload.suiteId}` }, 404);

  const result = await executeEvalRun({
    repo,
    suiteId: payload.suiteId,
    agentId: payload.agentId,
    agentVersionId: payload.agentVersionId,
    mode: payload.mode,
    runAgent: runAgentForConfig,
    parseAgentConfig: parseAgentConfigJson,
  });
  const evalRun = await repo.getEvalRun(result.evalRunId);
  return c.json({ ...result, evalRun }, 201);
});

app.get('/workflows', async (c) => c.json(await repo.listGraphWorkflows()));

app.post('/workflows/seed-demo', async (c) => {
  await repo.ensureGraphOrchestratorAgent();
  for (const agent of GRAPH_DEMO_AGENTS) {
    const configJson = AgentConfigSchema.parse({
      ...buildStarterAgentConfig({
        id: agent.id,
        name: agent.name,
        description: agent.description,
      }),
      tools: [...agent.tools],
    });
    await repo.upsertAgent({
      id: configJson.id,
      name: configJson.name,
      description: configJson.description,
      signature: configJson.signature,
      configJson,
    });
  }
  const workflow = await repo.upsertGraphWorkflow({
    id: DEMO_GRAPH_WORKFLOW.id,
    name: DEMO_GRAPH_WORKFLOW.name,
    description: DEMO_GRAPH_WORKFLOW.description,
    steps: DEMO_GRAPH_WORKFLOW.steps,
  });
  return c.json(workflow, 201);
});

app.get('/workflows/:id', async (c) => {
  const workflow = await repo.getGraphWorkflow(c.req.param('id'));
  if (!workflow) return c.json({ error: 'Not found' }, 404);
  return c.json(workflow);
});

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

app.post('/agents', async (c) => {
  const payload = CreateAgentSchema.parse(await c.req.json());
  const configJson = payload.template === 'demo'
    ? buildDemoTemplateAgentConfig(payload)
    : buildStarterAgentConfig(payload);

  try {
    const result = await repo.createAgent({
      id: payload.id,
      name: payload.name,
      description: payload.description,
      signature: configJson.signature,
      configJson,
    });
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Agent already exists:')) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
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

app.post('/agents/:id/duplicate', async (c) => {
  const sourceAgentId = c.req.param('id');
  const payload = DuplicateAgentSchema.parse(await c.req.json());
  const source = await repo.getAgent(sourceAgentId);
  if (!source) return c.json({ error: 'Not found' }, 404);

  const currentVersion = await repo.getCurrentAgentVersion(sourceAgentId);
  if (!currentVersion?.configJson) {
    return c.json({ error: 'Source agent has no config version' }, 400);
  }

  const sourceConfig = parseAgentConfigJson(currentVersion.configJson);
  const configJson = cloneAgentConfigForDuplicate(sourceConfig, {
    id: payload.id,
    name: payload.name,
  });

  try {
    const result = await repo.duplicateAgent({
      sourceAgentId,
      id: payload.id,
      name: configJson.name,
      description: configJson.description,
      signature: configJson.signature,
      configJson,
    });
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Agent already exists:')) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

app.get('/agents/:id/lab/suites', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  return c.json(await repo.listEvalSuites(agentId));
});

app.post('/agents/:id/lab/suites/seed-demo', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);

  const suites = await repo.listEvalSuites(agentId);
  const demoName = `${DEMO_EVAL_SUITE.name} (${agentId})`;
  const found = suites.find((suite) => suite.name === demoName);
  if (found) return c.json(found);

  const suite = await repo.createEvalSuite({
    name: demoName,
    description: DEMO_EVAL_SUITE.description,
    agentId,
    cases: DEMO_EVAL_SUITE.cases.map((row) => ({
      name: row.name,
      taskText: row.taskText,
      criteria: row.criteria,
      sortOrder: row.sortOrder,
    })),
  });
  return c.json(suite, 201);
});

app.post('/agents/:id/lab/baseline-eval', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const payload = CreateEvalRunSchema.parse({ ...(await c.req.json()), agentId });

  const result = await executeEvalRun({
    repo,
    suiteId: payload.suiteId,
    agentId,
    agentVersionId: payload.agentVersionId,
    runLabel: 'baseline',
    mode: payload.mode,
    runAgent: runAgentForConfig,
    parseAgentConfig: parseAgentConfigJson,
  });
  const evalRun = await repo.getEvalRun(result.evalRunId);
  return c.json({ ...result, evalRun }, 201);
});

app.post('/agents/:id/lab/optimize', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const payload = OptimizeAgentSchema.parse(await c.req.json());

  try {
    const result = await executeOptimizationWorkflow({
      repo: repo as LabRepository,
      agentId,
      suiteId: payload.suiteId,
      optimizerType: payload.optimizerType,
      optimizerConfig: payload.optimizerConfig,
      mode: payload.mode,
      runAgent: runAgentForConfig,
      parseAgentConfig: parseAgentConfigJson,
      loadAgentConfig,
    });
    const optimizationRun = await repo.getOptimizationRun(result.optimizationRunId);
    const candidate = await repo.getAgentCandidate(result.candidateId);
    return c.json({ ...result, optimizationRun, candidate }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key is required')) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

app.get('/agents/:id/lab/optimization-runs', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  return c.json(await repo.listOptimizationRuns(agentId));
});

app.get('/agents/:id/lab/candidates', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  return c.json(await repo.listAgentCandidates(agentId));
});

app.get('/agents/:id/lab/comparison', async (c) => {
  const agentId = c.req.param('id');
  const agent = await repo.getAgent(agentId);
  if (!agent) return c.json({ error: 'Not found' }, 404);
  const baselineEvalRunId = c.req.query('baselineEvalRunId');
  const candidateEvalRunId = c.req.query('candidateEvalRunId');
  if (!baselineEvalRunId || !candidateEvalRunId) {
    return c.json({ error: 'baselineEvalRunId and candidateEvalRunId are required' }, 400);
  }
  try {
    return c.json(await comparisonFromEvalRuns(baselineEvalRunId, candidateEvalRunId));
  } catch (error) {
    if (error instanceof Error) return c.json({ error: error.message }, 400);
    throw error;
  }
});

app.post('/agents/:id/lab/candidates/:candidateId/promote', async (c) => {
  const agentId = c.req.param('id');
  const candidateId = c.req.param('candidateId');
  const candidate = await repo.getAgentCandidate(candidateId);
  if (!candidate || candidate.agentId !== agentId) return c.json({ error: 'Not found' }, 404);
  if (candidate.status === 'promoted') return c.json({ error: 'Candidate already promoted' }, 409);
  if (candidate.status === 'rejected') return c.json({ error: 'Rejected candidates cannot be promoted' }, 409);

  const configJson = parseAgentConfigJson(candidate.artifactJson);
  const version = await repo.saveAgentVersion(agentId, {
    signature: configJson.signature,
    configJson,
  });

  const promoted = await repo.updateAgentCandidate(candidateId, {
    status: 'promoted',
    promotedVersionId: version.id,
    promotedAt: new Date(),
  });

  return c.json({ candidate: promoted, version });
});

app.post('/agents/:id/lab/candidates/:candidateId/reject', async (c) => {
  const agentId = c.req.param('id');
  const candidateId = c.req.param('candidateId');
  const candidate = await repo.getAgentCandidate(candidateId);
  if (!candidate || candidate.agentId !== agentId) return c.json({ error: 'Not found' }, 404);
  if (candidate.status === 'promoted') return c.json({ error: 'Promoted candidates cannot be rejected' }, 409);

  const rejected = await repo.updateAgentCandidate(candidateId, { status: 'rejected' });
  return c.json({ candidate: rejected });
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

  if (payload.workflowId) {
    const workflow = await repo.getGraphWorkflow(payload.workflowId);
    if (!workflow) return c.json({ error: `Workflow not found: ${payload.workflowId}` }, 404);
    const run = await repo.createGraphRun({
      requestId: payload.requestId,
      workflowId: payload.workflowId,
      taskText: request.body,
    });
    return c.json(run, 201);
  }

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
  const children = await repo.listChildRuns(run.id);
  return c.json({ run, events, children });
});

app.get('/runs/:id/children', async (c) => {
  const run = await repo.getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'Not found' }, 404);
  return c.json(await repo.listChildRuns(run.id));
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
