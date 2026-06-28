import type { createRepositories } from '@axplane/db';

type Repo = ReturnType<typeof createRepositories>;

export type BoardColumnId =
  | 'inbox'
  | 'ready'
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'done'
  | 'failed';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RunKind = 'agent' | 'graph' | 'axflow' | 'axdispatcher';

export type RouteDecision = {
  selectedAgentId: string;
  reason: string;
  strategy: string;
  confidence?: number;
};

export type BoardCard = {
  requestId: string;
  body: string;
  agentId: string;
  routeDecision: RouteDecision | null;
  latestRun: {
    id: string;
    status: RunStatus;
    runKind: RunKind;
    workflowId?: string;
    agentId: string;
    createdAt: string;
    parentRunId?: string | null;
    childRunCount: number;
  } | null;
  pendingApprovalCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardColumn = {
  id: BoardColumnId;
  label: string;
  cards: BoardCard[];
};

export type OperationsBoardResponse = {
  columns: BoardColumn[];
  counts: {
    total: number;
    activeRuns: number;
    pendingApprovals: number;
  };
  generatedAt: string;
};

export const BOARD_COLUMN_DEFS: ReadonlyArray<{ id: BoardColumnId; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'ready', label: 'Ready' },
  { id: 'queued', label: 'Queued' },
  { id: 'running', label: 'Running' },
  { id: 'needs_approval', label: 'Needs approval' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
];

const ACTIVE_RUN_STATUSES = new Set<RunStatus>(['queued', 'running', 'needs_approval']);
const ATTENTION_COLUMNS = new Set<BoardColumnId>(['inbox', 'ready', 'running', 'needs_approval', 'failed']);

const BODY_PREVIEW_LEN = 160;

function truncateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_LEN) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_LEN - 1)}…`;
}

function asRunKind(value: string): RunKind {
  if (value === 'graph' || value === 'axflow' || value === 'axdispatcher') return value;
  return 'agent';
}

function asRunStatus(value: string): RunStatus {
  if (
    value === 'queued'
    || value === 'running'
    || value === 'needs_approval'
    || value === 'completed'
    || value === 'failed'
    || value === 'cancelled'
  ) {
    return value;
  }
  return 'running';
}

function readWorkflowId(inputJson: unknown): string | undefined {
  if (typeof inputJson !== 'object' || inputJson === null) return undefined;
  const workflowId = (inputJson as Record<string, unknown>).workflowId;
  return typeof workflowId === 'string' ? workflowId : undefined;
}

export function resolveBoardColumn(input: {
  requestStatus: string;
  latestRun: { status: RunStatus } | null;
  pendingApprovalCount: number;
}): BoardColumnId {
  const { requestStatus, latestRun, pendingApprovalCount } = input;

  if (!latestRun) {
    return requestStatus === 'new' ? 'inbox' : 'ready';
  }

  if (pendingApprovalCount > 0 || latestRun.status === 'needs_approval') {
    return 'needs_approval';
  }

  switch (latestRun.status) {
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'running';
  }
}

export type BoardQuery = {
  agentId?: string;
  runKind?: RunKind;
  attention?: boolean;
};

export async function buildOperationsBoard(repo: Repo, query: BoardQuery = {}): Promise<OperationsBoardResponse> {
  const [requestRows, runRows, approvalRows] = await Promise.all([
    repo.listRequests(),
    repo.listRuns(),
    repo.listApprovals('pending'),
  ]);

  const pendingByRunId = new Map<string, number>();
  for (const approval of approvalRows) {
    pendingByRunId.set(approval.runId, (pendingByRunId.get(approval.runId) ?? 0) + 1);
  }

  const childCountByParentId = new Map<string, number>();
  for (const run of runRows) {
    if (run.parentRunId) {
      childCountByParentId.set(run.parentRunId, (childCountByParentId.get(run.parentRunId) ?? 0) + 1);
    }
  }

  const latestRunByRequestId = new Map<string, (typeof runRows)[number]>();
  for (const run of runRows) {
    if (run.parentRunId) continue;
    const existing = latestRunByRequestId.get(run.requestId);
    if (!existing || run.createdAt > existing.createdAt) {
      latestRunByRequestId.set(run.requestId, run);
    }
  }

  const cards: BoardCard[] = requestRows.map((request) => {
    const latestRun = latestRunByRequestId.get(request.id) ?? null;
    const pendingApprovalCount = latestRun ? (pendingByRunId.get(latestRun.id) ?? 0) : 0;

    return {
      requestId: request.id,
      body: truncateBody(request.body),
      agentId: request.agentId,
      routeDecision: (request.routeDecisionJson as RouteDecision | null) ?? null,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: asRunStatus(latestRun.status),
            runKind: asRunKind(latestRun.runKind),
            workflowId: readWorkflowId(latestRun.inputJson),
            agentId: latestRun.agentId,
            createdAt: latestRun.createdAt.toISOString(),
            parentRunId: latestRun.parentRunId,
            childRunCount: childCountByParentId.get(latestRun.id) ?? 0,
          }
        : null,
      pendingApprovalCount,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  });

  const filtered = cards.filter((card) => {
    if (query.agentId && card.agentId !== query.agentId && card.latestRun?.agentId !== query.agentId) {
      return false;
    }
    if (query.runKind && card.latestRun?.runKind !== query.runKind) {
      return false;
    }
    if (query.attention) {
      const columnId = resolveBoardColumn({
        requestStatus: requestRows.find((row) => row.id === card.requestId)?.status ?? 'routed',
        latestRun: card.latestRun ? { status: card.latestRun.status } : null,
        pendingApprovalCount: card.pendingApprovalCount,
      });
      if (!ATTENTION_COLUMNS.has(columnId)) return false;
    }
    return true;
  });

  const buckets = new Map<BoardColumnId, BoardCard[]>(
    BOARD_COLUMN_DEFS.map((column) => [column.id, []]),
  );

  for (const card of filtered) {
    const requestStatus = requestRows.find((row) => row.id === card.requestId)?.status ?? 'routed';
    const columnId = resolveBoardColumn({
      requestStatus,
      latestRun: card.latestRun ? { status: card.latestRun.status } : null,
      pendingApprovalCount: card.pendingApprovalCount,
    });
    buckets.get(columnId)?.push(card);
  }

  for (const columnCards of buckets.values()) {
    columnCards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const activeRuns = filtered.filter((card) => card.latestRun && ACTIVE_RUN_STATUSES.has(card.latestRun.status)).length;
  const pendingApprovals = filtered.reduce((sum, card) => sum + card.pendingApprovalCount, 0);

  return {
    columns: BOARD_COLUMN_DEFS.map((column) => ({
      id: column.id,
      label: column.label,
      cards: buckets.get(column.id) ?? [],
    })),
    counts: {
      total: filtered.length,
      activeRuns,
      pendingApprovals,
    },
    generatedAt: new Date().toISOString(),
  };
}
