import type { Hono } from 'hono';
import {
  buildExperimentCompareResult,
  buildExperimentTimeline,
  buildSuiteHealthReport,
  type ExperimentKind,
} from '@axplane/experiments';

function listDispatcherEvalRuns(): never[] {
  return [];
}

export type ExperimentsRepo = {
  listEvalRuns(filter?: { suiteId?: string; agentId?: string; limit?: number }): Promise<Array<{
    id: string;
    suiteId: string;
    agentId: string;
    status: string;
    mode: string;
    createdAt: Date;
    completedAt: Date | null;
    summaryJson: unknown;
  }>>;
  listOptimizationRunsFiltered(filter?: { agentId?: string; suiteId?: string; limit?: number }): Promise<Array<{
    id: string;
    suiteId: string;
    agentId: string;
    status: string;
    optimizerType: string;
    createdAt: Date;
    candidateId: string | null;
  }>>;
  getEvalSuite(suiteId: string): Promise<{
    id: string;
    cases: Array<{ id: string; name: string }>;
  } | null>;
  getEvalRun(evalRunId: string): Promise<{
    id: string;
    suiteId: string;
    agentId: string;
    status: string;
    mode: string;
    createdAt: Date;
    summaryJson: unknown;
    results?: Array<{ caseId: string; status: string; score: number }>;
  } | null>;
  getEvalSuiteMatrix(
    suiteId: string,
    opts: { runIds?: string[]; limit?: number; agentId?: string },
  ): Promise<import('@axplane/eval').EvalMatrix | null>;
};

function parseKind(value: string | undefined): ExperimentKind | undefined {
  if (value === 'eval' || value === 'optimization' || value === 'dispatcher') return value;
  return undefined;
}

export function registerExperimentsRoutes(app: Hono, repo: ExperimentsRepo) {
  app.get('/experiments/timeline', async (c) => {
    const agentId = c.req.query('agentId') || undefined;
    const suiteId = c.req.query('suiteId') || undefined;
    const kind = parseKind(c.req.query('kind'));
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;

    const evalRuns = await repo.listEvalRuns({
      agentId,
      suiteId,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    const optimizationRuns = await repo.listOptimizationRunsFiltered({
      agentId,
      suiteId,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    const dispatcherRuns = kind === 'dispatcher' || !kind
      ? listDispatcherEvalRuns().slice(0, Number.isFinite(limit) ? limit : 50)
      : [];

    const items = buildExperimentTimeline({
      evalRuns: evalRuns.map((run) => ({
        ...run,
        summaryJson: run.summaryJson as {
          averageScore?: number;
          passedCases?: number;
          caseCount?: number;
        } | null,
      })),
      optimizationRuns,
      dispatcherRuns,
      kind,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return c.json({ items });
  });

  app.get('/experiments/suite-health', async (c) => {
    const suiteId = c.req.query('suiteId');
    if (!suiteId) return c.json({ error: 'suiteId is required' }, 400);

    const agentId = c.req.query('agentId') || null;
    const windowDaysRaw = c.req.query('windowDays');
    const windowDays = windowDaysRaw ? Number.parseInt(windowDaysRaw, 10) : 30;

    const suite = await repo.getEvalSuite(suiteId);
    if (!suite) return c.json({ error: 'Not found' }, 404);

    const evalRuns = await repo.listEvalRuns({
      suiteId,
      agentId: agentId || undefined,
      limit: 100,
    });

    const finished = evalRuns.filter((run) => run.completedAt != null);
    const runsWithResults = await Promise.all(
      finished.map(async (run) => {
        const detail = await repo.getEvalRun(run.id);
        return {
          id: run.id,
          createdAt: run.createdAt,
          results: detail?.results ?? [],
        };
      }),
    );

    const report = buildSuiteHealthReport({
      suiteId,
      agentId,
      windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30,
      cases: suite.cases.map((row) => ({ id: row.id, name: row.name })),
      evalRuns: runsWithResults,
    });

    return c.json(report);
  });

  app.get('/experiments/compare', async (c) => {
    const runIdsParam = c.req.query('runIds');
    if (!runIdsParam) return c.json({ error: 'runIds is required' }, 400);

    const runIds = runIdsParam.split(',').map((id) => id.trim()).filter(Boolean);
    if (runIds.length < 2) return c.json({ error: 'At least two runIds are required' }, 400);

    const runs = await Promise.all(runIds.map((id) => repo.getEvalRun(id)));
    if (runs.some((run) => !run)) return c.json({ error: 'One or more eval runs not found' }, 404);

    const suiteIds = new Set(runs.map((run) => run!.suiteId));
    if (suiteIds.size !== 1) {
      return c.json({ error: 'All runs must belong to the same eval suite' }, 400);
    }

    const suiteId = runs[0]!.suiteId;
    const matrix = await repo.getEvalSuiteMatrix(suiteId, { runIds });
    if (!matrix) return c.json({ error: 'Suite not found' }, 404);

    const compareRuns = runs.map((run) => {
      const summary = run!.summaryJson as {
        averageScore?: number;
        passedCases?: number;
        caseCount?: number;
      } | null;
      return {
        id: run!.id,
        agentId: run!.agentId,
        suiteId: run!.suiteId,
        status: run!.status,
        mode: run!.mode,
        createdAt: run!.createdAt.toISOString(),
        summary: summary
          ? {
              averageScore: summary.averageScore ?? 0,
              passedCases: summary.passedCases ?? 0,
              caseCount: summary.caseCount ?? 0,
            }
          : null,
      };
    });

    return c.json(buildExperimentCompareResult({ suiteId, runs: compareRuns, matrix }));
  });
}
