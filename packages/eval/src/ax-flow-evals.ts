/**
 * Ax-flow LLM-judge eval contract (Slice F / issue #12).
 * Mirrors ax-sandbox `evals/store.ts` + ax-studio `lib/evals-types.ts`.
 * Execution lives on ax-server; AxPlane proxies and renders these shapes.
 */

export type AxFlowEvalCheck = {
  id: string;
  label: string;
  passed: number;
  total: number;
};

export type AxFlowEvalCase = {
  id: string;
  input: string;
  expected: string;
  got: string;
  ok: boolean;
  failReason?: string;
};

/** One judge-graded eval run for an ax-flow id. */
export type AxFlowEvalRun = {
  id: string;
  flowId: string;
  ts: string;
  score: number;
  passed: number;
  total: number;
  prevScore?: number;
  durationSec?: number;
  checks: AxFlowEvalCheck[];
  cases: AxFlowEvalCase[];
};

export type AxFlowTestCase = {
  id: string;
  input: string;
  expected: string;
};

export type AxFlowTestSet = {
  flowId: string;
  cases: AxFlowTestCase[];
};

export type AxFlowEvalPlan = {
  cases: number;
  callsPerCase: number;
  totalCalls: number;
};

export type AxFlowEvalHistory = {
  latest: AxFlowEvalRun | null;
  runs: AxFlowEvalRun[];
};

export const axFlowScorePct = (score: number) => Math.round(score * 100);

/** Flatten flow output for judge grading (ported from ax-sandbox evals/run.ts). */
export function pickFlowOutputText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const strs = Object.values(v as Record<string, unknown>).filter(
      (x): x is string => typeof x === 'string',
    );
    return strs.length ? strs.join('\n\n') : JSON.stringify(v);
  }
  return String(v ?? '');
}

/** Pre-run LLM call estimate: cases × (flow stages + 1 judge call per case). */
export function planAxFlowEvalCalls(testSet: AxFlowTestSet, stageCount: number): AxFlowEvalPlan {
  const cases = testSet.cases.length;
  const callsPerCase = stageCount + 1;
  return { cases, callsPerCase, totalCalls: cases * callsPerCase };
}
