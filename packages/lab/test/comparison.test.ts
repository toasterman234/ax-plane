import { describe, expect, it } from 'vitest';
import { buildEvalComparison, metricsFromEvalRun } from '../src/comparison';

describe('comparison', () => {
  it('builds delta metrics between baseline and candidate', () => {
    const baseline = {
      evalRunId: 'a',
      averageScore: 62,
      passedCases: 2,
      caseCount: 3,
      avgTurns: 9,
      toolMistakes: 3,
      costUsd: 0.14,
    };
    const candidate = {
      evalRunId: 'b',
      averageScore: 84,
      passedCases: 3,
      caseCount: 3,
      avgTurns: 4,
      toolMistakes: 0,
      costUsd: 0.07,
    };

    const comparison = buildEvalComparison(baseline, candidate);
    expect(comparison.delta.score).toBe(22);
    expect(comparison.delta.avgTurns).toBe(-5);
    expect(comparison.delta.toolMistakes).toBe(-3);
  });

  it('aggregates turns, mistakes, and cost from case snapshots', () => {
    const summary = {
      caseCount: 2,
      passedCases: 1,
      failedCases: 1,
      averageScore: 50,
      mode: 'mock' as const,
    };
    const metrics = metricsFromEvalRun('run-1', summary, [
      {
        runId: 'r1',
        events: [{ type: 'ax.actor_turn' }, { type: 'ax.actor_turn' }],
        toolCalls: [{ qualifiedName: 'fake.riskyAction', status: 'failed' }],
        usageRows: [{ costUsdMicro: 70_000 }],
      },
      {
        runId: 'r2',
        events: [{ type: 'ax.actor_turn' }],
        toolCalls: [],
        usageRows: [{ costUsdMicro: 30_000 }],
      },
    ]);

    expect(metrics.avgTurns).toBe(1.5);
    expect(metrics.toolMistakes).toBe(1);
    expect(metrics.costUsd).toBe(0.1);
  });
});
