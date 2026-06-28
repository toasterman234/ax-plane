import type { SuiteHealthCase, SuiteHealthReport } from './types';

type CaseRow = { id: string; name: string };

type EvalRunWithResults = {
  id: string;
  createdAt: Date | string;
  results: Array<{ caseId: string; status: string; score: number }>;
};

function iso(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

export function buildSuiteHealthReport(input: {
  suiteId: string;
  agentId: string | null;
  windowDays: number;
  cases: CaseRow[];
  evalRuns: EvalRunWithResults[];
}): SuiteHealthReport {
  const cutoff = Date.now() - input.windowDays * 24 * 60 * 60 * 1000;
  const runs = input.evalRuns
    .filter((run) => new Date(iso(run.createdAt)).getTime() >= cutoff)
    .sort((a, b) => iso(b.createdAt).localeCompare(iso(a.createdAt)));

  const cases: SuiteHealthCase[] = input.cases.map((evalCase) => {
    const results = runs.flatMap((run) => {
      const row = run.results.find((result) => result.caseId === evalCase.id);
      return row ? [{ ...row, createdAt: iso(run.createdAt) }] : [];
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const passedCount = results.filter((row) => row.status === 'passed').length;
    const runCount = results.length;
    const latest = results[0];
    const prior = results[1];
    const passRate = runCount === 0 ? 0 : Math.round((passedCount / runCount) * 100);
    const regressionFlag = Boolean(
      latest && prior && prior.status === 'passed' && latest.status !== 'passed',
    );
    const flakyFlag = runCount >= 2 && passRate > 0 && passRate < 100;

    return {
      caseId: evalCase.id,
      name: evalCase.name,
      latestScore: latest?.score ?? null,
      latestStatus: latest?.status ?? null,
      passRate,
      runCount,
      regressionFlag,
      flakyFlag,
    };
  });

  return {
    suiteId: input.suiteId,
    agentId: input.agentId,
    windowDays: input.windowDays,
    runCount: runs.length,
    cases: cases.sort((a, b) => Number(b.regressionFlag) - Number(a.regressionFlag) || a.name.localeCompare(b.name)),
  };
}
