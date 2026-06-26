import type { ExperimentKind, ExperimentTimelineItem } from './types';

type EvalRunRow = {
  id: string;
  suiteId: string;
  agentId: string;
  status: string;
  mode: string;
  createdAt: Date | string;
  summaryJson: {
    averageScore?: number;
    passedCases?: number;
    caseCount?: number;
  } | null;
};

type OptimizationRunRow = {
  id: string;
  suiteId: string;
  agentId: string;
  status: string;
  optimizerType: string;
  createdAt: Date | string;
  candidateId: string | null;
};

type DispatcherRunRow = {
  id: string;
  status: string;
  startedAt: string;
  summary: { passed: number; failed: number; total: number; skipped?: number };
};

function iso(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

export function buildExperimentTimeline(input: {
  evalRuns: EvalRunRow[];
  optimizationRuns: OptimizationRunRow[];
  dispatcherRuns: DispatcherRunRow[];
  kind?: ExperimentKind;
  limit?: number;
}): ExperimentTimelineItem[] {
  const limit = input.limit ?? 50;
  const items: ExperimentTimelineItem[] = [];

  if (!input.kind || input.kind === 'eval') {
    for (const run of input.evalRuns) {
      items.push({
        id: run.id,
        kind: 'eval',
        agentId: run.agentId,
        suiteId: run.suiteId,
        status: run.status,
        label: `Eval · ${run.mode}`,
        summary: {
          averageScore: run.summaryJson?.averageScore,
          passed: run.summaryJson?.passedCases,
          total: run.summaryJson?.caseCount,
        },
        createdAt: iso(run.createdAt),
        href: '/agents/eval',
      });
    }
  }

  if (!input.kind || input.kind === 'optimization') {
    for (const run of input.optimizationRuns) {
      items.push({
        id: run.id,
        kind: 'optimization',
        agentId: run.agentId,
        suiteId: run.suiteId,
        status: run.status,
        label: `Optimize · ${run.optimizerType}`,
        summary: { optimizerType: run.optimizerType },
        createdAt: iso(run.createdAt),
        href: `/agents/${run.agentId}`,
      });
    }
  }

  if (!input.kind || input.kind === 'dispatcher') {
    for (const run of input.dispatcherRuns) {
      const total = run.summary.total - (run.summary.skipped ?? 0);
      items.push({
        id: run.id,
        kind: 'dispatcher',
        agentId: null,
        suiteId: null,
        status: run.status,
        label: 'Dispatcher routing eval',
        summary: {
          passed: run.summary.passed,
          total,
        },
        createdAt: run.startedAt,
        href: '/workflows/dispatcher',
      });
    }
  }

  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
