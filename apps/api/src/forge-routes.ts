import type { Context } from 'hono';
import type { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { AgentIdSchema, parseAgentConfigJson } from '@axplane/agents';
import type { Repositories } from '@axplane/db';
import type { RunAgentFn } from '@axplane/eval';
import {
  PartialForgeIntakeSchema,
  mergeForgeIntake,
  parsePartialForgeIntake,
  commitForgeSession,
  runForgeOptimize,
  scaffoldForgeSession,
  type ForgeDraft,
  type ForgeDraftMeta,
  type ForgeRepository,
  type ForgeSessionRecord,
  type PartialForgeIntake,
} from '@axplane/forge';
import type { LabRepository } from '@axplane/lab';

const CreateForgeSessionSchema = z.object({
  intake: PartialForgeIntakeSchema.optional(),
});

const PatchForgeSessionSchema = z.object({
  intake: PartialForgeIntakeSchema,
});

const ScaffoldForgeSessionSchema = z.object({
  agentId: AgentIdSchema.optional(),
  name: z.string().min(1).optional(),
  strategy: z.enum(['heuristic', 'llm']).default('heuristic'),
  mode: z.enum(['mock', 'real']).default('mock'),
});

const CommitForgeSessionSchema = z.object({
  agentId: AgentIdSchema.optional(),
  name: z.string().min(1).optional(),
  runBaseline: z.boolean().default(false),
  mode: z.enum(['mock', 'real']).default('mock'),
});

const ForgeOptimizeSchema = z.object({
  optimizerType: z.enum(['ax-native-mock', 'ax-native']).default('ax-native-mock'),
  optimizerConfig: z.object({
    maxMetricCalls: z.number().int().min(1).max(100).optional(),
    verbose: z.boolean().optional(),
  }).optional(),
  mode: z.enum(['mock', 'real']).default('mock'),
});

type ForgeSessionRow = NonNullable<Awaited<ReturnType<Repositories['getForgeSession']>>>;

function sessionFromRow(row: ForgeSessionRow): ForgeSessionRecord {
  return {
    id: row.id,
    status: row.status,
    intakeJson: parsePartialForgeIntake(row.intakeJson ?? {}),
    draftJson: (row.draftJson as ForgeDraft | null) ?? null,
    draftMetaJson: (row.draftMetaJson as ForgeDraftMeta | null) ?? null,
    agentId: row.agentId,
    suiteId: row.suiteId,
    error: row.error,
  };
}

export function createForgeRepoAdapter(repo: Repositories): ForgeRepository & LabRepository {
  const labRepo = repo as unknown as LabRepository;
  return {
    ...labRepo,
    async getForgeSession(id: string) {
      const row = await repo.getForgeSession(id);
      return row ? sessionFromRow(row) : null;
    },
    async updateForgeSession(id, patch) {
      const row = await repo.updateForgeSession(id, {
        status: patch.status,
        intakeJson: patch.intakeJson as Record<string, unknown> | undefined,
        draftJson: patch.draftJson,
        draftMetaJson: patch.draftMetaJson,
        agentId: patch.agentId,
        suiteId: patch.suiteId,
        error: patch.error,
      });
      return row ? sessionFromRow(row) : null;
    },
    createAgent: repo.createAgent.bind(repo),
    async createEvalSuite(input) {
      const suite = await repo.createEvalSuite(input);
      return suite ? { id: suite.id } : null;
    },
  };
}

function sessionLinks(session: ForgeSessionRecord) {
  const links: Record<string, string> = {};
  if (session.agentId) {
    links.agent = `/agents/${session.agentId}`;
    links.agentLab = `/agents/${session.agentId}`;
  }
  if (session.suiteId) {
    links.evalSuite = `/eval/suites/${session.suiteId}`;
  }
  return links;
}

function jsonSession(session: ForgeSessionRecord, extra: Record<string, unknown> = {}) {
  return {
    session,
    links: sessionLinks(session),
    ...extra,
  };
}

function forgeErrorStatus(message: string): ContentfulStatusCode {
  if (message.includes('not found')) return 404;
  if (message.startsWith('Agent already exists:')) return 409;
  if (message.includes('requires agent mode')) return 400;
  if (message.includes('must be committed')) return 400;
  if (message.includes('requires mode=real')) return 400;
  return 500;
}

export type RegisterForgeRoutesDeps = {
  repo: Repositories;
  runAgent: RunAgentFn;
  loadAgentConfig: (agentId: string) => Promise<import('@axplane/agents').AgentConfig>;
};

export function registerForgeRoutes(app: Hono, deps: RegisterForgeRoutesDeps) {
  const forgeRepo = createForgeRepoAdapter(deps.repo);

  app.get('/forge/sessions', async (c) => {
    const limit = Number(c.req.query('limit') ?? 50);
    const rows = await deps.repo.listForgeSessions(Number.isFinite(limit) ? limit : 50);
    return c.json({
      sessions: rows.map((row) => sessionFromRow(row)),
    });
  });

  app.post('/forge/sessions', async (c) => {
    const payload = CreateForgeSessionSchema.parse(await c.req.json().catch(() => ({})));
    const row = await deps.repo.createForgeSession({
      intake: payload.intake ?? {},
    });
    return c.json(jsonSession(sessionFromRow(row)), 201);
  });

  app.get('/forge/sessions/:id', async (c) => {
    const session = await forgeRepo.getForgeSession(c.req.param('id'));
    if (!session) return c.json({ error: 'Forge session not found' }, 404);
    return c.json(jsonSession(session));
  });

  app.patch('/forge/sessions/:id', async (c) => {
    const sessionId = c.req.param('id');
    const existing = await forgeRepo.getForgeSession(sessionId);
    if (!existing) return c.json({ error: 'Forge session not found' }, 404);

    const payload = PatchForgeSessionSchema.parse(await c.req.json());
    const intakeJson = mergeForgeIntake(existing.intakeJson, payload.intake) as PartialForgeIntake;
    const row = await deps.repo.updateForgeSession(sessionId, {
      intakeJson: intakeJson as Record<string, unknown>,
      status: existing.draftJson ? 'intake' : existing.status,
      draftJson: existing.draftJson ? null : undefined,
      error: null,
    });
    if (!row) return c.json({ error: 'Forge session not found' }, 404);
    return c.json(jsonSession(sessionFromRow(row)));
  });

  app.post('/forge/sessions/:id/scaffold', async (c) => {
    const sessionId = c.req.param('id');
    const existing = await forgeRepo.getForgeSession(sessionId);
    if (!existing) return c.json({ error: 'Forge session not found' }, 404);

    const queryStrategy = c.req.query('strategy');
    const payload = ScaffoldForgeSessionSchema.parse({
      ...(await c.req.json().catch(() => ({}))),
      ...(queryStrategy === 'heuristic' || queryStrategy === 'llm'
        ? { strategy: queryStrategy }
        : {}),
    });
    try {
      const { draft, meta } = await scaffoldForgeSession({
        repo: forgeRepo,
        sessionId,
        agentId: payload.agentId,
        name: payload.name,
        strategy: payload.strategy,
        mode: payload.mode,
      });
      const session = await forgeRepo.getForgeSession(sessionId);
      return c.json(jsonSession(session!, { draft, scaffoldMeta: meta }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('API key is required')) {
        return c.json({ error: error.message }, 400);
      }
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Intake incomplete for scaffold', issues: error.issues }, 400);
      }
      throw error;
    }
  });

  app.post('/forge/sessions/:id/commit', async (c) => {
    const sessionId = c.req.param('id');
    const existing = await forgeRepo.getForgeSession(sessionId);
    if (!existing) return c.json({ error: 'Forge session not found' }, 404);

    const payload = CommitForgeSessionSchema.parse(await c.req.json().catch(() => ({})));
    try {
      const result = await commitForgeSession({
        repo: forgeRepo,
        sessionId,
        agentId: payload.agentId,
        name: payload.name,
        runBaseline: payload.runBaseline,
        mode: payload.mode,
        runAgent: deps.runAgent,
        parseAgentConfig: parseAgentConfigJson,
      });
      const session = await forgeRepo.getForgeSession(sessionId);
      const agent = await deps.repo.getAgent(result.agentId);
      const suite = await deps.repo.getEvalSuite(result.suiteId);
      let baselineEvalRun = null;
      if (result.baselineEvalRunId) {
        baselineEvalRun = await deps.repo.getEvalRun(result.baselineEvalRunId);
      }
      return c.json({
        ...result,
        session: session!,
        links: sessionLinks(session!),
        agent,
        suite,
        baselineEvalRun,
      }, 201);
    } catch (error) {
      if (error instanceof Error) {
        const status = forgeErrorStatus(error.message);
        if (status !== 500) return c.json({ error: error.message }, status);
      }
      throw error;
    }
  });

  app.post('/forge/sessions/:id/optimize', async (c) => {
    const sessionId = c.req.param('id');
    const existing = await forgeRepo.getForgeSession(sessionId);
    if (!existing) return c.json({ error: 'Forge session not found' }, 404);

    const payload = ForgeOptimizeSchema.parse(await c.req.json().catch(() => ({})));
    try {
      const result = await runForgeOptimize({
        repo: forgeRepo,
        sessionId,
        optimizerType: payload.optimizerType,
        optimizerConfig: payload.optimizerConfig,
        mode: payload.mode,
        runAgent: deps.runAgent,
        parseAgentConfig: parseAgentConfigJson,
        loadAgentConfig: deps.loadAgentConfig,
      });
      const session = await forgeRepo.getForgeSession(sessionId);
      const optimizationRun = await deps.repo.getOptimizationRun(result.optimizationRunId);
      const candidate = await deps.repo.getAgentCandidate(result.candidateId);
      return c.json({
        ...result,
        session: session!,
        links: sessionLinks(session!),
        optimizationRun,
        candidate,
      }, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('API key is required')) {
          return c.json({ error: error.message }, 400);
        }
        const status = forgeErrorStatus(error.message);
        if (status !== 500) return c.json({ error: error.message }, status);
      }
      throw error;
    }
  });
}

export function handleForgeRouteError(err: unknown, c: Context) {
  if (err instanceof Error && err.message.startsWith('Forge session not found:')) {
    return c.json({ error: err.message }, 404);
  }
  return null;
}
