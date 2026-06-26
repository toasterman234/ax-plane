import { describe, expect, it } from 'vitest';
import { buildDashboardSummary } from './dashboard-summary';
import type { HealthPayload } from './health-payload';

const health: HealthPayload = {
  ok: true,
  service: 'axplane-api',
  worker: { ok: true, mode: 'mock' },
  axEngine: { reachable: true, flowCount: 3, url: 'http://127.0.0.1:8810', dispatcherAvailable: true },
  router: { mode: 'keyword', executionMode: 'mock' },
};

describe('buildDashboardSummary', () => {
  it('aggregates counts and attention items', async () => {
    const repo = {
      listAgents: async () => [{ id: 'default_ax_agent', name: 'Default', enabled: true }],
      listGraphWorkflows: async () => [{ id: 'wf1', name: 'Sample' }],
      listRequests: async () => [{ id: 'r1' }],
      listRuns: async () => [
        {
          id: 'run-needs',
          agentId: 'default_ax_agent',
          status: 'needs_approval',
          createdAt: new Date('2026-06-26T12:00:00Z'),
        },
        {
          id: 'run-done',
          agentId: 'default_ax_agent',
          status: 'completed',
          createdAt: new Date('2026-06-26T11:00:00Z'),
        },
      ],
      listApprovals: async () => [
        { id: 'a1', runId: 'run-needs', toolName: 'shell.run', status: 'pending', decidedAt: null },
      ],
    };

    const summary = await buildDashboardSummary(repo as never, health);

    expect(summary.counts.agents).toBe(1);
    expect(summary.counts.pendingApprovals).toBe(1);
    expect(summary.counts.activeRuns).toBe(1);
    expect(summary.setup.hasDefaultAgent).toBe(true);
    expect(summary.setup.hasApprovalFlow).toBe(true);
    expect(summary.attention).toHaveLength(2);
    expect(summary.recentRuns[0]?.id).toBe('run-needs');
  });
});
