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

/** Kilroy-style column panel tints (full column background). */
export const COLUMN_TONE: Record<string, string> = {
  inbox: 'border-border/40 bg-muted/25',
  ready: 'border-sky-500/25 bg-sky-500/5',
  queued: 'border-indigo-500/25 bg-indigo-500/5',
  running: 'border-amber-500/30 bg-amber-500/10',
  needs_approval: 'border-orange-500/35 bg-orange-500/10',
  done: 'border-emerald-500/25 bg-emerald-500/5',
  failed: 'border-red-500/35 bg-red-500/10',
};

export const COLUMN_DOT: Record<string, string> = {
  inbox: 'bg-zinc-400',
  ready: 'bg-sky-400',
  queued: 'bg-indigo-400',
  running: 'bg-amber-400',
  needs_approval: 'bg-orange-400',
  done: 'bg-emerald-400',
  failed: 'bg-red-400',
};

/** Workflow columns to keep visible even when empty (hide-empty toggle). */
export const PINNED_EMPTY_COLUMNS = new Set(['inbox', 'ready', 'queued', 'running', 'needs_approval']);

const COLUMN_DISPLAY_ORDER = [
  'inbox',
  'ready',
  'queued',
  'running',
  'needs_approval',
  'done',
  'failed',
] as const;

function compareColumnOrder(a: BoardColumn, b: BoardColumn): number {
  return COLUMN_DISPLAY_ORDER.indexOf(a.id as typeof COLUMN_DISPLAY_ORDER[number])
    - COLUMN_DISPLAY_ORDER.indexOf(b.id as typeof COLUMN_DISPLAY_ORDER[number]);
}

/** Non-empty columns first so cards are visible without horizontal hunting. */
export function sortColumnsForDisplay(columns: BoardColumn[]): BoardColumn[] {
  const withCards = columns.filter((column) => column.cards.length > 0).sort(compareColumnOrder);
  const empty = columns.filter((column) => column.cards.length === 0).sort(compareColumnOrder);
  return [...withCards, ...empty];
}

export function filterVisibleColumns(columns: BoardColumn[], hideEmpty: boolean): BoardColumn[] {
  if (!hideEmpty) return columns;

  const filtered = columns.filter(
    (column) => column.cards.length > 0 || PINNED_EMPTY_COLUMNS.has(column.id),
  );

  return sortColumnsForDisplay(filtered);
}

export type BoardCardWithColumn = BoardCard & {
  columnId: string;
  columnLabel: string;
};

export function countColumnCards(columns: BoardColumn[], columnId: string): number {
  return columns.find((column) => column.id === columnId)?.cards.length ?? 0;
}

export function flattenBoardCards(columns: BoardColumn[]): BoardCardWithColumn[] {
  return columns
    .flatMap((column) => column.cards.map((card) => ({
      ...card,
      columnId: column.id,
      columnLabel: column.label,
    })))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

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
