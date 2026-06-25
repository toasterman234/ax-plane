import type { AgentConfig } from '@axplane/agents';
import type { EvalRunSummary } from '@axplane/eval';

export type OptimizerType = 'ax-native-mock' | 'ax-native';

export type OptimizeAgentInput = {
  agentId: string;
  agentConfig: AgentConfig;
  optimizerType: OptimizerType;
  optimizerConfig?: Record<string, unknown>;
};

export type OptimizeAgentResult = {
  candidateConfig: AgentConfig;
  artifactText: string;
  metrics?: Record<string, unknown>;
};

export type EvalRunMetrics = {
  evalRunId: string;
  averageScore: number;
  passedCases: number;
  caseCount: number;
  avgTurns: number;
  toolMistakes: number;
  costUsd: number;
};

export type EvalComparison = {
  baseline: EvalRunMetrics;
  candidate: EvalRunMetrics;
  delta: {
    score: number;
    passedCases: number;
    avgTurns: number;
    toolMistakes: number;
    costUsd: number;
  };
};

export type OptimizationWorkflowResult = {
  optimizationRunId: string;
  baselineEvalRunId: string;
  candidateEvalRunId: string;
  candidateId: string;
  baselineSummary: EvalRunSummary;
  candidateSummary: EvalRunSummary;
  comparison: EvalComparison;
};
