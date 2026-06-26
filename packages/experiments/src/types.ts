export type ExperimentKind = 'eval' | 'optimization' | 'dispatcher';

export type ExperimentTimelineItem = {
  id: string;
  kind: ExperimentKind;
  agentId: string | null;
  suiteId: string | null;
  status: string;
  label: string;
  summary: {
    averageScore?: number;
    passed?: number;
    total?: number;
    optimizerType?: string;
  };
  createdAt: string;
  href: string;
};

export type SuiteHealthCase = {
  caseId: string;
  name: string;
  latestScore: number | null;
  latestStatus: string | null;
  passRate: number;
  runCount: number;
  regressionFlag: boolean;
  flakyFlag: boolean;
};

export type SuiteHealthReport = {
  suiteId: string;
  agentId: string | null;
  windowDays: number;
  runCount: number;
  cases: SuiteHealthCase[];
};

export type ExperimentCompareRun = {
  id: string;
  agentId: string;
  suiteId: string;
  status: string;
  mode: string;
  createdAt: string;
  summary: {
    averageScore: number;
    passedCases: number;
    caseCount: number;
  } | null;
};

export type ExperimentCompareResult = {
  suiteId: string;
  runs: ExperimentCompareRun[];
  matrix: import('@axplane/eval').EvalMatrix;
  scoreSpread: { min: number; max: number; delta: number } | null;
};
