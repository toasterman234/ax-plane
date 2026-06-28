export type EvalMatrixCase = {
  id: string;
  name: string;
  sortOrder: number;
};

export type EvalMatrixRun = {
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
};

export type EvalMatrixCell = {
  caseId: string;
  runId: string;
  status: string;
  score: number;
  underlyingRunId: string | null;
};

export type EvalMatrix = {
  suiteId: string;
  cases: EvalMatrixCase[];
  runs: EvalMatrixRun[];
  cells: EvalMatrixCell[];
};

type MatrixRunInput = {
  id: string;
  createdAt: Date | string;
  agentId: string;
  agentVersionId: string | null;
  status: string;
  mode: string;
  summaryJson: {
    averageScore?: number;
    passedCases?: number;
    caseCount?: number;
  } | null;
};

type MatrixResultInput = {
  evalRunId: string;
  caseId: string;
  status: string;
  score: number;
  runId: string | null;
};

type MatrixCaseInput = {
  id: string;
  name: string;
  sortOrder: number;
};

export function formatEvalRunLabel(createdAt: Date | string, averageScore: number | null): string {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const short = date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (averageScore == null || Number.isNaN(averageScore)) return short;
  return `${short} · ${Math.round(averageScore)}%`;
}

export function buildEvalMatrix(input: {
  suiteId: string;
  cases: MatrixCaseInput[];
  runs: MatrixRunInput[];
  results: MatrixResultInput[];
}): EvalMatrix {
  const cases = [...input.cases].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const runs = input.runs.map((run) => ({
    id: run.id,
    createdAt: typeof run.createdAt === 'string' ? run.createdAt : run.createdAt.toISOString(),
    agentId: run.agentId,
    agentVersionId: run.agentVersionId,
    status: run.status,
    mode: run.mode,
    averageScore: run.summaryJson?.averageScore ?? null,
    passedCases: run.summaryJson?.passedCases ?? null,
    caseCount: run.summaryJson?.caseCount ?? null,
    label: formatEvalRunLabel(
      run.createdAt,
      run.summaryJson?.averageScore ?? null,
    ),
  }));

  const cells: EvalMatrixCell[] = input.results.map((row) => ({
    caseId: row.caseId,
    runId: row.evalRunId,
    status: row.status,
    score: row.score,
    underlyingRunId: row.runId,
  }));

  return { suiteId: input.suiteId, cases, runs, cells };
}

export function cellKey(caseId: string, runId: string): string {
  return `${caseId}:${runId}`;
}

export function indexMatrixCells(cells: EvalMatrixCell[]): Map<string, EvalMatrixCell> {
  const map = new Map<string, EvalMatrixCell>();
  for (const cell of cells) map.set(cellKey(cell.caseId, cell.runId), cell);
  return map;
}
