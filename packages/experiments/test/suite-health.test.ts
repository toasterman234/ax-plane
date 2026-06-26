import { describe, expect, it } from 'vitest';
import { buildSuiteHealthReport } from '../src/suite-health';

describe('buildSuiteHealthReport', () => {
  it('flags regression when latest case fails after prior pass', () => {
    const report = buildSuiteHealthReport({
      suiteId: 'suite-1',
      agentId: 'agent-a',
      windowDays: 30,
      cases: [{ id: 'c1', name: 'Alpha' }],
      evalRuns: [
        {
          id: 'r2',
          createdAt: '2026-06-26T12:00:00.000Z',
          results: [{ caseId: 'c1', status: 'failed', score: 40 }],
        },
        {
          id: 'r1',
          createdAt: '2026-06-25T12:00:00.000Z',
          results: [{ caseId: 'c1', status: 'passed', score: 100 }],
        },
      ],
    });

    expect(report.cases[0]?.regressionFlag).toBe(true);
    expect(report.cases[0]?.latestScore).toBe(40);
    expect(report.runCount).toBe(2);
  });
});
