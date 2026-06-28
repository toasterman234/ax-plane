import { describe, expect, it } from 'vitest';
import {
  barWidths,
  buildCaseComparisonRows,
  comparisonMetrics,
  deltaTone,
} from '../src/lab-comparison';

describe('buildCaseComparisonRows', () => {
  it('sorts by score delta descending and flags regressions', () => {
    const rows = buildCaseComparisonRows(
      [
        { caseId: 'a', caseName: 'Alpha', status: 'passed', score: 100 },
        { caseId: 'b', caseName: 'Beta', status: 'passed', score: 80 },
      ],
      [
        { caseId: 'a', caseName: 'Alpha', status: 'failed', score: 40 },
        { caseId: 'b', caseName: 'Beta', status: 'passed', score: 100 },
      ],
    );

    expect(rows[0]?.caseId).toBe('b');
    expect(rows[0]?.scoreDelta).toBe(20);
    expect(rows.find((row) => row.caseId === 'a')?.regression).toBe(true);
  });
});

describe('comparisonMetrics', () => {
  it('derives pass rate and deltas', () => {
    const metrics = comparisonMetrics({
      baseline: {
        averageScore: 70,
        avgTurns: 3,
        toolMistakes: 2,
        costUsd: 0.01,
        passedCases: 1,
        caseCount: 2,
      },
      candidate: {
        averageScore: 90,
        avgTurns: 2,
        toolMistakes: 0,
        costUsd: 0.008,
        passedCases: 2,
        caseCount: 2,
      },
      delta: { score: 20, passedCases: 1, avgTurns: -1, toolMistakes: -2, costUsd: -0.002 },
    });

    expect(metrics.find((row) => row.key === 'passRate')?.candidate).toBe(100);
    expect(deltaTone(20, true)).toBe('good');
    expect(deltaTone(-1, false)).toBe('good');
    expect(barWidths(3, 2, false).candidateWidth).toBeGreaterThan(barWidths(3, 2, false).baselineWidth);
  });
});
