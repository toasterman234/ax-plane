export type EvalSuite = {
  id: string;
  name: string;
  description: string;
  cases: Array<{ id: string; name: string; taskText: string }>;
};

export type EvalRunSummary = {
  caseCount: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  mode: string;
};

export type EvalCaseResult = {
  id: string;
  caseId: string;
  caseName: string;
  runId: string | null;
  status: string;
  score: number;
  detailsJson?: CaseScoreDetails | { error?: string; score?: CaseScoreDetails };
};

export type CriterionResult = {
  criterion: { type: string; [key: string]: unknown };
  passed: boolean;
  message: string;
};

export type CaseScoreDetails = {
  passed: number;
  total: number;
  score: number;
  results: CriterionResult[];
};

export type EvalRun = {
  id: string;
  suiteId: string;
  agentId: string;
  agentVersionId: string | null;
  status: string;
  mode: string;
  summaryJson: EvalRunSummary | null;
  createdAt: string;
  completedAt: string | null;
  results?: EvalCaseResult[];
};

export type EvalMatrix = {
  suiteId: string;
  cases: Array<{ id: string; name: string; sortOrder: number }>;
  runs: Array<{
    id: string;
    createdAt: string;
    agentId: string;
    agentVersionId: string | null;
    status: string;
    mode: string;
    averageScore: number | null;
    passedCases: number | null;
    caseCount: number | null;
    label: string;
  }>;
  cells: Array<{
    caseId: string;
    runId: string;
    status: string;
    score: number;
    underlyingRunId: string | null;
  }>;
};

export type AgentRow = { id: string; name: string };
export type AgentVersion = { id: string; version: number; isCurrent: boolean };

export function cellKey(caseId: string, runId: string): string {
  return `${caseId}:${runId}`;
}

export function normalizeCaseDetails(detailsJson: EvalCaseResult['detailsJson']): CaseScoreDetails | null {
  if (!detailsJson || typeof detailsJson !== 'object') return null;
  if ('score' in detailsJson && detailsJson.score && typeof detailsJson.score === 'object') {
    return detailsJson.score as CaseScoreDetails;
  }
  if ('results' in detailsJson && Array.isArray(detailsJson.results)) {
    return detailsJson as CaseScoreDetails;
  }
  return null;
}
