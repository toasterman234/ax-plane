import { DEFAULT_AGENT_ID } from '@axplane/agents';
import type { createRepositories } from '@axplane/db';
import type { HealthPayload } from './health-payload';

type Repo = ReturnType<typeof createRepositories>;

export type DashboardAttentionItem = {
  key: string;
  text: string;
  href: string;
  cta: string;
};

export type DashboardSummary = {
  health: HealthPayload;
  counts: {
    agents: number;
    workflows: number;
    requests: number;
    pendingApprovals: number;
    activeRuns: number;
  };
  setup: {
    hasDefaultAgent: boolean;
    hasRequest: boolean;
    hasCompletedRun: boolean;
    hasApprovalFlow: boolean;
    complete: boolean;
    doneCount: number;
    totalSteps: number;
  };
  recentRuns: Array<{
    id: string;
    agentId: string;
    status: string;
    createdAt: string;
  }>;
  attention: DashboardAttentionItem[];
};

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'needs_approval']);

export async function buildDashboardSummary(repo: Repo, health: HealthPayload): Promise<DashboardSummary> {
  const [agents, workflows, requests, runs, approvals] = await Promise.all([
    repo.listAgents(),
    repo.listGraphWorkflows(),
    repo.listRequests(),
    repo.listRuns(),
    repo.listApprovals(),
  ]);

  const pendingApprovals = approvals.filter((row) => row.status === 'pending');
  const decidedApprovals = approvals.filter((row) => row.status !== 'pending');
  const hasDefaultAgent = agents.some((agent) => agent.id === DEFAULT_AGENT_ID);
  const hasRequest = requests.length > 0;
  const hasCompletedRun = runs.some((run) => run.status === 'completed');
  const hasApprovalFlow = decidedApprovals.length > 0 || pendingApprovals.length > 0;

  const setupFlags = [hasDefaultAgent, hasRequest, hasCompletedRun, hasApprovalFlow];
  const doneCount = setupFlags.filter(Boolean).length;

  const attention: DashboardAttentionItem[] = [];
  if (pendingApprovals.length > 0) {
    attention.push({
      key: 'approvals',
      text: `${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? '' : 's'}`,
      href: '/operations/approvals',
      cta: 'Review',
    });
  }
  for (const run of runs.filter((row) => row.status === 'needs_approval').slice(0, 3)) {
    attention.push({
      key: run.id,
      text: `Run ${run.id.slice(0, 8)}… waiting on approval (${run.agentId})`,
      href: `/runs/${run.id}`,
      cta: 'Open run',
    });
  }
  for (const run of runs.filter((row) => row.status === 'failed' || row.status === 'cancelled').slice(0, 3)) {
    attention.push({
      key: `failed-${run.id}`,
      text: `Failed run ${run.id.slice(0, 8)}… (${run.agentId})`,
      href: `/runs/${run.id}`,
      cta: 'Inspect',
    });
  }

  return {
    health,
    counts: {
      agents: agents.length,
      workflows: workflows.length,
      requests: requests.length,
      pendingApprovals: pendingApprovals.length,
      activeRuns: runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length,
    },
    setup: {
      hasDefaultAgent,
      hasRequest,
      hasCompletedRun,
      hasApprovalFlow,
      complete: doneCount === setupFlags.length,
      doneCount,
      totalSteps: setupFlags.length,
    },
    recentRuns: runs.slice(0, 5).map((run) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
    })),
    attention,
  };
}
