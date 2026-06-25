import type { EvalRunSummary } from '@axplane/eval';
import type { EvalComparison, EvalRunMetrics } from './types';

export type CaseRunSnapshot = {
  runId: string | null;
  events: Array<{ type: string }>;
  toolCalls: Array<{ qualifiedName: string; status: string }>;
  usageRows: Array<{ costUsdMicro: number | null }>;
};

export function metricsFromEvalRun(
  evalRunId: string,
  summary: EvalRunSummary,
  caseSnapshots: CaseRunSnapshot[],
): EvalRunMetrics {
  const runsWithIds = caseSnapshots.filter((row) => row.runId);
  const turnTotal = runsWithIds.reduce(
    (sum, row) => sum + row.events.filter((event) => event.type === 'ax.actor_turn').length,
    0,
  );
  const toolMistakes = runsWithIds.reduce(
    (sum, row) => sum + row.toolCalls.filter((tool) => tool.status === 'failed' || tool.status === 'blocked').length,
    0,
  );
  const costUsdMicro = runsWithIds.reduce(
    (sum, row) => sum + row.usageRows.reduce((inner, usage) => inner + (usage.costUsdMicro ?? 0), 0),
    0,
  );

  return {
    evalRunId,
    averageScore: summary.averageScore,
    passedCases: summary.passedCases,
    caseCount: summary.caseCount,
    avgTurns: runsWithIds.length === 0 ? 0 : Math.round((turnTotal / runsWithIds.length) * 10) / 10,
    toolMistakes,
    costUsd: Math.round(costUsdMicro) / 1_000_000,
  };
}

export function buildEvalComparison(baseline: EvalRunMetrics, candidate: EvalRunMetrics): EvalComparison {
  return {
    baseline,
    candidate,
    delta: {
      score: candidate.averageScore - baseline.averageScore,
      passedCases: candidate.passedCases - baseline.passedCases,
      avgTurns: Math.round((candidate.avgTurns - baseline.avgTurns) * 10) / 10,
      toolMistakes: candidate.toolMistakes - baseline.toolMistakes,
      costUsd: Math.round((candidate.costUsd - baseline.costUsd) * 1_000_000) / 1_000_000,
    },
  };
}
