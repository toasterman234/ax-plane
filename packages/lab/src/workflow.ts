import type { AgentConfig } from '@axplane/agents';
import { optimizeAxAgent } from '@axplane/ax-adapter';
import type { EvalRepository, RunAgentFn } from '@axplane/eval';
import { executeEvalRun } from '@axplane/eval';
import { buildEvalComparison, metricsFromEvalRun, type CaseRunSnapshot } from './comparison';
import { mockOptimizeAgent } from './mock-optimizer';
import type { OptimizationWorkflowResult, OptimizerType } from './types';

export type LabRepository = EvalRepository & {
  getEvalSuite(suiteId: string): Promise<{
    id: string;
    name: string;
    description: string;
    cases: Array<{
      id: string;
      name: string;
      taskText: string;
      criteria: import('@axplane/eval').EvalCriterion[];
      sortOrder: number;
    }>;
  } | null>;
  createOptimizationRun(input: {
    agentId: string;
    suiteId: string;
    optimizerType: string;
    optimizerConfig?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  updateOptimizationRun(
    optimizationRunId: string,
    patch: {
      status?: string;
      baselineEvalRunId?: string | null;
      candidateEvalRunId?: string | null;
      candidateId?: string | null;
      error?: string | null;
      completedAt?: Date;
    },
  ): Promise<unknown>;
  createAgentCandidate(input: {
    agentId: string;
    sourceOptimizationRunId?: string | null;
    name: string;
    status?: string;
    artifactJson: unknown;
    artifactText?: string | null;
    baselineScore?: number | null;
    candidateScore?: number | null;
    metricsJson?: Record<string, unknown>;
  }): Promise<{ id: string }>;
  updateAgentCandidate(
    candidateId: string,
    patch: {
      status?: string;
      baselineScore?: number | null;
      candidateScore?: number | null;
      metricsJson?: Record<string, unknown>;
    },
  ): Promise<unknown>;
  listRunEvents(runId: string): Promise<Array<{ type: string; payloadJson: unknown }>>;
  listToolCallsForRun(runId: string): Promise<Array<{ qualifiedName: string; status: string }>>;
  listModelUsageForRun(runId: string): Promise<Array<{ costUsdMicro: number | null }>>;
  getEvalRun(evalRunId: string): Promise<{
    id: string;
    results?: Array<{ runId: string | null }>;
  } | null>;
};

export type ExecuteOptimizationArgs = {
  repo: LabRepository;
  agentId: string;
  suiteId: string;
  optimizerType?: OptimizerType;
  optimizerConfig?: Record<string, unknown>;
  mode?: 'mock' | 'real';
  runAgent: RunAgentFn;
  parseAgentConfig: (json: unknown) => AgentConfig;
  loadAgentConfig: (agentId: string) => Promise<AgentConfig>;
};

async function collectCaseSnapshots(
  repo: LabRepository,
  evalRunId: string,
): Promise<CaseRunSnapshot[]> {
  const evalRun = await repo.getEvalRun(evalRunId);
  if (!evalRun?.results) return [];

  return Promise.all(
    evalRun.results.map(async (result) => {
      if (!result.runId) {
        return { runId: null, events: [], toolCalls: [], usageRows: [] };
      }
      const [events, toolCalls, usageRows] = await Promise.all([
        repo.listRunEvents(result.runId),
        repo.listToolCallsForRun(result.runId),
        repo.listModelUsageForRun(result.runId),
      ]);
      return {
        runId: result.runId,
        events,
        toolCalls,
        usageRows,
      };
    }),
  );
}

async function optimizeConfig(
  agentConfig: AgentConfig,
  optimizerType: OptimizerType,
  suiteId: string,
  repo: LabRepository,
  mode: 'mock' | 'real',
  optimizerConfig?: Record<string, unknown>,
) {
  if (optimizerType === 'ax-native') {
    if (mode !== 'real') {
      throw new Error('ax-native optimizer requires mode=real and a configured LLM API key (AX_API_KEY)');
    }
    const suite = await repo.getEvalSuite(suiteId);
    if (!suite) throw new Error(`Eval suite not found: ${suiteId}`);
    return optimizeAxAgent({
      agentConfig,
      evalCases: suite.cases,
      optimizerConfig: {
        maxMetricCalls: typeof optimizerConfig?.maxMetricCalls === 'number'
          ? optimizerConfig.maxMetricCalls
          : undefined,
        verbose: optimizerConfig?.verbose === true,
      },
    });
  }
  return mockOptimizeAgent({
    agentId: agentConfig.id,
    agentConfig,
    optimizerType,
    optimizerConfig,
  });
}

export async function executeOptimizationWorkflow(
  args: ExecuteOptimizationArgs,
): Promise<OptimizationWorkflowResult> {
  const optimizerType = args.optimizerType ?? 'ax-native-mock';
  const mode = args.mode ?? 'mock';
  const agentConfig = await args.loadAgentConfig(args.agentId);

  const optimizationRun = await args.repo.createOptimizationRun({
    agentId: args.agentId,
    suiteId: args.suiteId,
    optimizerType,
    optimizerConfig: args.optimizerConfig,
  });

  try {
    const baseline = await executeEvalRun({
      repo: args.repo,
      suiteId: args.suiteId,
      agentId: args.agentId,
      runLabel: 'baseline',
      mode,
      runAgent: args.runAgent,
      parseAgentConfig: args.parseAgentConfig,
    });

    const optimized = await optimizeConfig(
      agentConfig,
      optimizerType,
      args.suiteId,
      args.repo,
      mode,
      args.optimizerConfig,
    );
    const candidate = await args.repo.createAgentCandidate({
      agentId: args.agentId,
      sourceOptimizationRunId: optimizationRun.id,
      name: `Candidate ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      status: 'draft',
      artifactJson: optimized.candidateConfig,
      artifactText: optimized.artifactText,
      metricsJson: optimized.metrics,
    });

    await args.repo.updateOptimizationRun(optimizationRun.id, { candidateId: candidate.id });

    const candidateEval = await executeEvalRun({
      repo: args.repo,
      suiteId: args.suiteId,
      agentId: args.agentId,
      configOverride: optimized.candidateConfig,
      candidateId: candidate.id,
      runLabel: 'candidate',
      mode,
      runAgent: args.runAgent,
      parseAgentConfig: args.parseAgentConfig,
    });

    const baselineSnapshots = await collectCaseSnapshots(args.repo, baseline.evalRunId);
    const candidateSnapshots = await collectCaseSnapshots(args.repo, candidateEval.evalRunId);
    const baselineMetrics = metricsFromEvalRun(baseline.evalRunId, baseline.summary, baselineSnapshots);
    const candidateMetrics = metricsFromEvalRun(candidateEval.evalRunId, candidateEval.summary, candidateSnapshots);
    const comparison = buildEvalComparison(baselineMetrics, candidateMetrics);

    await args.repo.updateAgentCandidate(candidate.id, {
      status: 'evaluated',
      baselineScore: baseline.summary.averageScore,
      candidateScore: candidateEval.summary.averageScore,
      metricsJson: { comparison, optimizer: optimized.metrics },
    });

    await args.repo.updateOptimizationRun(optimizationRun.id, {
      status: 'completed',
      baselineEvalRunId: baseline.evalRunId,
      candidateEvalRunId: candidateEval.evalRunId,
      candidateId: candidate.id,
      completedAt: new Date(),
    });

    return {
      optimizationRunId: optimizationRun.id,
      baselineEvalRunId: baseline.evalRunId,
      candidateEvalRunId: candidateEval.evalRunId,
      candidateId: candidate.id,
      baselineSummary: baseline.summary,
      candidateSummary: candidateEval.summary,
      comparison,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await args.repo.updateOptimizationRun(optimizationRun.id, {
      status: 'failed',
      error: message,
      completedAt: new Date(),
    });
    throw error;
  }
}
