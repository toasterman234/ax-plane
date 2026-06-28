import { describe, expect, it } from 'vitest';
import { buildEvalMatrix, formatEvalRunLabel, indexMatrixCells } from '../src/matrix';

describe('buildEvalMatrix', () => {
  it('orders cases by sortOrder and builds run labels', () => {
    const matrix = buildEvalMatrix({
      suiteId: 'suite-1',
      cases: [
        { id: 'c2', name: 'Beta', sortOrder: 2 },
        { id: 'c1', name: 'Alpha', sortOrder: 1 },
      ],
      runs: [
        {
          id: 'r1',
          createdAt: '2026-06-26T14:00:00.000Z',
          agentId: 'agent-a',
          agentVersionId: null,
          status: 'completed',
          mode: 'mock',
          summaryJson: { averageScore: 80, passedCases: 1, caseCount: 2 },
        },
      ],
      results: [
        { evalRunId: 'r1', caseId: 'c1', status: 'passed', score: 100, runId: 'run-a' },
        { evalRunId: 'r1', caseId: 'c2', status: 'failed', score: 60, runId: 'run-b' },
      ],
    });

    expect(matrix.cases.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(matrix.runs).toHaveLength(1);
    expect(matrix.runs[0]?.label).toContain('80%');
    expect(matrix.cells).toHaveLength(2);

    const byKey = indexMatrixCells(matrix.cells);
    expect(byKey.get('c1:r1')?.status).toBe('passed');
    expect(byKey.get('c2:r1')?.score).toBe(60);
  });
});

describe('formatEvalRunLabel', () => {
  it('includes score when present', () => {
    const label = formatEvalRunLabel('2026-06-26T14:00:00.000Z', 92);
    expect(label).toContain('92%');
  });
});
