import { buildEvalMatrix } from '@axplane/eval/matrix';
import { api } from './api';
import type { EvalMatrix, EvalRun, EvalSuite } from './eval-types';

export async function fetchEvalMatrixFromRuns(input: {
  suite: EvalSuite;
  runs: EvalRun[];
  limit?: number;
}): Promise<EvalMatrix> {
  const limit = input.limit ?? 8;
  const finished = input.runs.filter((run) => run.completedAt != null);
  const recent = finished.slice(0, limit).reverse();

  if (recent.length === 0) {
    return buildEvalMatrix({
      suiteId: input.suite.id,
      cases: input.suite.cases.map((row, index) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder ?? index,
      })),
      runs: [],
      results: [],
    });
  }

  const details = await Promise.all(recent.map((run) => api<EvalRun>(`/eval/runs/${run.id}`)));

  return buildEvalMatrix({
    suiteId: input.suite.id,
    cases: input.suite.cases.map((row, index) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder ?? index,
    })),
    runs: recent.map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      agentId: run.agentId,
      agentVersionId: run.agentVersionId,
      status: run.status,
      mode: run.mode,
      summaryJson: run.summaryJson,
    })),
    results: details.flatMap((run) =>
      (run.results ?? []).map((result) => ({
        evalRunId: run.id,
        caseId: result.caseId,
        status: result.status,
        score: result.score,
        runId: result.runId,
      })),
    ),
  });
}

export async function fetchEvalMatrix(input: {
  suiteId: string;
  suite: EvalSuite;
  agentId?: string;
  limit?: number;
}): Promise<EvalMatrix> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 8) });
  if (input.agentId) params.set('agentId', input.agentId);

  try {
    return await api<EvalMatrix>(`/eval/suites/${input.suiteId}/matrix?${params.toString()}`);
  } catch {
    const runParams = new URLSearchParams();
    runParams.set('suiteId', input.suiteId);
    if (input.agentId) runParams.set('agentId', input.agentId);
    const runs = await api<EvalRun[]>(`/eval/runs?${runParams.toString()}`);
    return fetchEvalMatrixFromRuns({ suite: input.suite, runs, limit: input.limit ?? 8 });
  }
}
