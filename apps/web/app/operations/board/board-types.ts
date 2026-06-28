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
    status: string;
    runKind: RunKind;
    workflowId?: string;
    agentId: string;
    createdAt: string;
    childRunCount: number;
  } | null;
  pendingApprovalCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardColumn = {
  id: string;
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

export const COLUMN_ACCENT: Record<string, string> = {
  inbox: 'border-t-zinc-400',
  ready: 'border-t-sky-400',
  queued: 'border-t-indigo-400',
  running: 'border-t-amber-400',
  needs_approval: 'border-t-orange-400',
  done: 'border-t-emerald-400',
  failed: 'border-t-red-400',
};

/** Columns whose cards can be dragged to start work. */
export const DRAG_SOURCE_COLUMNS = new Set(['inbox', 'ready']);

/** Drop here to POST /runs and queue execution. */
export const DROP_START_COLUMNS = new Set(['queued', 'running']);

export function isCardDraggable(columnId: string, card: BoardCard): boolean {
  return DRAG_SOURCE_COLUMNS.has(columnId) && !card.latestRun;
}

export function isColumnDropTarget(columnId: string): boolean {
  return DROP_START_COLUMNS.has(columnId);
}
