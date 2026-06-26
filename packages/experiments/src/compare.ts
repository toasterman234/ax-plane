import type { EvalMatrix } from '@axplane/eval/matrix';
import type { ExperimentCompareResult, ExperimentCompareRun } from './types';

export function buildExperimentCompareResult(input: {
  suiteId: string;
  runs: ExperimentCompareRun[];
  matrix: EvalMatrix;
}): ExperimentCompareResult {
  const scores = input.runs
    .map((run) => run.summary?.averageScore)
    .filter((score): score is number => typeof score === 'number');

  const scoreSpread = scores.length >= 2
    ? {
        min: Math.min(...scores),
        max: Math.max(...scores),
        delta: Math.max(...scores) - Math.min(...scores),
      }
    : null;

  return {
    suiteId: input.suiteId,
    runs: input.runs,
    matrix: input.matrix,
    scoreSpread,
  };
}
