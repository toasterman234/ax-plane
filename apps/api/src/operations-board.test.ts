import { describe, expect, it } from 'vitest';
import { buildOperationsBoard, resolveBoardColumn } from './operations-board';

describe('resolveBoardColumn', () => {
  it('places unrouted requests in inbox', () => {
    expect(resolveBoardColumn({ requestStatus: 'new', latestRun: null, pendingApprovalCount: 0 })).toBe('inbox');
  });

  it('places routed requests without runs in ready', () => {
    expect(resolveBoardColumn({ requestStatus: 'routed', latestRun: null, pendingApprovalCount: 0 })).toBe('ready');
  });

  it('maps run lifecycle statuses', () => {
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'queued' },
      pendingApprovalCount: 0,
    })).toBe('queued');
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'running' },
      pendingApprovalCount: 0,
    })).toBe('running');
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'completed' },
      pendingApprovalCount: 0,
    })).toBe('done');
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'failed' },
      pendingApprovalCount: 0,
    })).toBe('failed');
  });

  it('prioritizes pending approvals over run status', () => {
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'running' },
      pendingApprovalCount: 1,
    })).toBe('needs_approval');
    expect(resolveBoardColumn({
      requestStatus: 'routed',
      latestRun: { status: 'needs_approval' },
      pendingApprovalCount: 0,
    })).toBe('needs_approval');
  });
});

describe('buildOperationsBoard', () => {
  it('buckets requests into columns with latest top-level run overlay', async () => {
    const repo = {
      listRequests: async () => [
        {
          id: 'req-inbox',
          body: 'New task',
          agentId: 'default_ax_agent',
          status: 'new',
          routeDecisionJson: null,
          createdAt: new Date('2026-06-27T10:00:00Z'),
          updatedAt: new Date('2026-06-27T10:00:00Z'),
        },
        {
          id: 'req-ready',
          body: 'Routed but not started',
          agentId: 'default_ax_agent',
          status: 'routed',
          routeDecisionJson: { selectedAgentId: 'default_ax_agent', reason: 'default', strategy: 'default' },
          createdAt: new Date('2026-06-27T09:00:00Z'),
          updatedAt: new Date('2026-06-27T09:00:00Z'),
        },
        {
          id: 'req-running',
          body: 'Active work',
          agentId: 'default_ax_agent',
          status: 'routed',
          routeDecisionJson: null,
          createdAt: new Date('2026-06-27T08:00:00Z'),
          updatedAt: new Date('2026-06-27T08:30:00Z'),
        },
      ],
      listRuns: async () => [
        {
          id: 'run-parent',
          requestId: 'req-running',
          agentId: 'default_ax_agent',
          parentRunId: null,
          runKind: 'graph',
          status: 'running',
          inputJson: { workflowId: 'lookup_summarize' },
          createdAt: new Date('2026-06-27T08:10:00Z'),
        },
        {
          id: 'run-child',
          requestId: 'req-running',
          agentId: 'workflow_lookup_agent',
          parentRunId: 'run-parent',
          runKind: 'agent',
          status: 'completed',
          inputJson: {},
          createdAt: new Date('2026-06-27T08:20:00Z'),
        },
      ],
      listApprovals: async () => [],
    };

    const board = await buildOperationsBoard(repo as never);

    const byId = (id: string) => board.columns.flatMap((column) => column.cards).find((card) => card.requestId === id);

    expect(byId('req-inbox')).toBeTruthy();
    expect(board.columns.find((column) => column.id === 'inbox')?.cards.some((card) => card.requestId === 'req-inbox')).toBe(true);
    expect(board.columns.find((column) => column.id === 'ready')?.cards.some((card) => card.requestId === 'req-ready')).toBe(true);

    const runningCard = byId('req-running');
    expect(runningCard?.latestRun?.id).toBe('run-parent');
    expect(runningCard?.latestRun?.runKind).toBe('graph');
    expect(runningCard?.latestRun?.workflowId).toBe('lookup_summarize');
    expect(runningCard?.latestRun?.childRunCount).toBe(1);
    expect(board.counts.activeRuns).toBe(1);
  });

  it('filters by agent and attention mode', async () => {
    const repo = {
      listRequests: async () => [
        {
          id: 'req-a',
          body: 'Agent A',
          agentId: 'agent_a',
          status: 'routed',
          routeDecisionJson: null,
          createdAt: new Date('2026-06-27T10:00:00Z'),
          updatedAt: new Date('2026-06-27T10:00:00Z'),
        },
        {
          id: 'req-b',
          body: 'Agent B done',
          agentId: 'agent_b',
          status: 'routed',
          routeDecisionJson: null,
          createdAt: new Date('2026-06-27T09:00:00Z'),
          updatedAt: new Date('2026-06-27T09:00:00Z'),
        },
      ],
      listRuns: async () => [
        {
          id: 'run-b',
          requestId: 'req-b',
          agentId: 'agent_b',
          parentRunId: null,
          runKind: 'agent',
          status: 'completed',
          inputJson: {},
          createdAt: new Date('2026-06-27T09:05:00Z'),
        },
      ],
      listApprovals: async () => [],
    };

    const byAgent = await buildOperationsBoard(repo as never, { agentId: 'agent_a' });
    expect(byAgent.counts.total).toBe(1);
    expect(byAgent.columns.find((column) => column.id === 'ready')?.cards[0]?.requestId).toBe('req-a');

    const attention = await buildOperationsBoard(repo as never, { attention: true });
    expect(attention.counts.total).toBe(1);
    expect(attention.columns.flatMap((column) => column.cards).some((card) => card.requestId === 'req-b')).toBe(false);
  });
});
