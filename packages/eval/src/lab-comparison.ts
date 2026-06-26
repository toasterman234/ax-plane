export type CaseComparisonRow = {
  caseId: string;
  caseName: string;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  baselineStatus: string;
  candidateStatus: string;
  regression: boolean;
  improved: boolean;
};

type CaseResultInput = {
  caseId: string;
  caseName: string;
  status: string;
  score: number;
};

export function buildCaseComparisonRows(
  baselineResults: CaseResultInput[],
  candidateResults: CaseResultInput[],
): CaseComparisonRow[] {
  const candidateByCaseId = new Map(candidateResults.map((row) => [row.caseId, row]));
  const seen = new Set<string>();

  const rows: CaseComparisonRow[] = baselineResults.map((baseline) => {
    seen.add(baseline.caseId);
    const candidate = candidateByCaseId.get(baseline.caseId);
    const candidateScore = candidate?.score ?? 0;
    const candidateStatus = candidate?.status ?? 'missing';
    const scoreDelta = candidateScore - baseline.score;
    const regression = baseline.status === 'passed' && candidateStatus !== 'passed';
    const improved = baseline.status !== 'passed' && candidateStatus === 'passed';
    return {
      caseId: baseline.caseId,
      caseName: baseline.caseName,
      baselineScore: baseline.score,
      candidateScore,
      scoreDelta,
      baselineStatus: baseline.status,
      candidateStatus,
      regression,
      improved,
    };
  });

  for (const candidate of candidateResults) {
    if (seen.has(candidate.caseId)) continue;
    rows.push({
      caseId: candidate.caseId,
      caseName: candidate.caseName,
      baselineScore: 0,
      candidateScore: candidate.score,
      scoreDelta: candidate.score,
      baselineStatus: 'missing',
      candidateStatus: candidate.status,
      regression: false,
      improved: candidate.status === 'passed',
    });
  }

  return rows.sort((a, b) => b.scoreDelta - a.scoreDelta || a.caseName.localeCompare(b.caseName));
}

export type LabEvalComparison = {
  baseline: {
    evalRunId?: string;
    averageScore: number;
    avgTurns: number;
    toolMistakes: number;
    costUsd: number;
    passedCases: number;
    caseCount: number;
  };
  candidate: {
    evalRunId?: string;
    averageScore: number;
    avgTurns: number;
    toolMistakes: number;
    costUsd: number;
    passedCases: number;
    caseCount: number;
  };
  delta: {
    score: number;
    passedCases: number;
    avgTurns: number;
    toolMistakes: number;
    costUsd: number;
  };
};

export type ComparisonMetric = {
  key: string;
  label: string;
  baseline: number;
  candidate: number;
  delta: number;
  higherIsBetter: boolean;
  format: (value: number) => string;
};

export function comparisonMetrics(comparison: LabEvalComparison): ComparisonMetric[] {
  const baselinePassRate = comparison.baseline.caseCount
    ? (comparison.baseline.passedCases / comparison.baseline.caseCount) * 100
    : 0;
  const candidatePassRate = comparison.candidate.caseCount
    ? (comparison.candidate.passedCases / comparison.candidate.caseCount) * 100
    : 0;

  return [
    {
      key: 'score',
      label: 'Avg score',
      baseline: comparison.baseline.averageScore,
      candidate: comparison.candidate.averageScore,
      delta: comparison.delta.score,
      higherIsBetter: true,
      format: (value) => `${Math.round(value)}%`,
    },
    {
      key: 'passRate',
      label: 'Pass rate',
      baseline: baselinePassRate,
      candidate: candidatePassRate,
      delta: candidatePassRate - baselinePassRate,
      higherIsBetter: true,
      format: (value) => `${Math.round(value)}%`,
    },
    {
      key: 'avgTurns',
      label: 'Avg turns',
      baseline: comparison.baseline.avgTurns,
      candidate: comparison.candidate.avgTurns,
      delta: comparison.delta.avgTurns,
      higherIsBetter: false,
      format: (value) => value.toFixed(1),
    },
    {
      key: 'toolMistakes',
      label: 'Tool mistakes',
      baseline: comparison.baseline.toolMistakes,
      candidate: comparison.candidate.toolMistakes,
      delta: comparison.delta.toolMistakes,
      higherIsBetter: false,
      format: (value) => String(Math.round(value)),
    },
    {
      key: 'costUsd',
      label: 'Cost / run',
      baseline: comparison.baseline.costUsd,
      candidate: comparison.candidate.costUsd,
      delta: comparison.delta.costUsd,
      higherIsBetter: false,
      format: (value) => `$${value.toFixed(4)}`,
    },
  ];
}

export function barWidths(
  baseline: number,
  candidate: number,
  higherIsBetter: boolean,
): { baselineWidth: number; candidateWidth: number } {
  const max = Math.max(baseline, candidate, higherIsBetter ? 1 : 0.0001);
  if (higherIsBetter) {
    return {
      baselineWidth: (baseline / max) * 100,
      candidateWidth: (candidate / max) * 100,
    };
  }
  const invert = (value: number) => ((max - value) / max) * 100;
  return {
    baselineWidth: invert(baseline),
    candidateWidth: invert(candidate),
  };
}

export function deltaTone(delta: number, higherIsBetter: boolean): 'good' | 'bad' | 'neutral' {
  if (delta === 0) return 'neutral';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'good' : 'bad';
}
