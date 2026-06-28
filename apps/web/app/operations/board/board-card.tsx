'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { AlertCircle, ExternalLink, GripVertical, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BoardCard, RunKind } from './board-types';

const RUN_KIND_LABEL: Record<RunKind, string> = {
  agent: 'Agent',
  graph: 'Graph',
  axflow: 'AX Flow',
  axdispatcher: 'Dispatcher',
};

function statusClass(status: string) {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'failed' || status === 'cancelled') return 'text-red-400';
  if (status === 'needs_approval') return 'text-amber-400';
  if (status === 'running') return 'text-sky-400';
  return 'text-muted-foreground';
}

export type TaskDragData = {
  type: 'Task';
  card: BoardCard;
  sourceColumnId: string;
};

function CardBody({
  card,
  onStartRun,
  starting,
  draggable,
  onInspect,
}: {
  card: BoardCard;
  onStartRun: (requestId: string) => void;
  starting: boolean;
  draggable: boolean;
  onInspect?: () => void;
}) {
  const run = card.latestRun;
  const showStart = !run;

  const bodyContent = (
    <>
      <p className="line-clamp-4 text-sm leading-snug">{card.body}</p>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {card.routeDecision?.selectedAgentId ?? card.agentId}
        </span>
        {run ? (
          <>
            <span className={`rounded bg-muted px-1.5 py-0.5 text-[10px] ${statusClass(run.status)}`}>
              {run.status}
            </span>
            <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">
              {RUN_KIND_LABEL[run.runKind]}
            </span>
            {run.workflowId ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {run.workflowId}
              </span>
            ) : null}
            {run.childRunCount > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {run.childRunCount} step{run.childRunCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </>
        ) : null}
        {card.pendingApprovalCount > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            <AlertCircle className="h-2.5 w-2.5" />
            {card.pendingApprovalCount} approval{card.pendingApprovalCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {onInspect ? (
        <button
          type="button"
          className="w-full space-y-2 rounded-md text-left hover:bg-muted/40"
          onClick={onInspect}
        >
          {bodyContent}
        </button>
      ) : (
        <div className="space-y-2">{bodyContent}</div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {showStart ? (
          <Button
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onStartRun(card.requestId);
            }}
            disabled={starting}
          >
            <Play className="h-3 w-3 shrink-0" aria-hidden />
            Start run
          </Button>
        ) : (
          <Link
            href={`/runs/${run!.id}`}
            className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs hover:bg-muted"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Open run
          </Link>
        )}
        {card.pendingApprovalCount > 0 ? (
          <Link
            href="/operations/approvals"
            className="inline-flex h-7 items-center rounded-md border border-amber-900/40 bg-amber-950/20 px-2 text-xs text-amber-200 hover:bg-amber-950/40"
            onClick={(event) => event.stopPropagation()}
          >
            Review
          </Link>
        ) : null}
      </div>

      <p className="font-mono text-[10px] text-muted-foreground">
        {draggable ? 'Drag to Queued or Running to start · ' : ''}
        {onInspect ? 'Click body to inspect · ' : ''}
        {card.requestId.slice(0, 8)}…
      </p>
    </>
  );
}

export function BoardCardTile({
  card,
  columnId,
  onStartRun,
  starting,
  isOverlay,
  onInspect,
}: {
  card: BoardCard;
  columnId: string;
  onStartRun: (requestId: string) => void;
  starting: boolean;
  isOverlay?: boolean;
  onInspect?: (card: BoardCard, columnId: string) => void;
}) {
  const draggable = !isOverlay && !card.latestRun && (columnId === 'inbox' || columnId === 'ready');

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.requestId,
    disabled: !draggable,
    data: {
      type: 'Task',
      card,
      sourceColumnId: columnId,
    } satisfies TaskDragData,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  if (!draggable) {
    return (
      <Card className="space-y-2 p-3 shadow-sm">
        <CardBody
          card={card}
          onStartRun={onStartRun}
          starting={starting}
          draggable={false}
          onInspect={onInspect && !isOverlay ? () => onInspect(card, columnId) : undefined}
        />
      </Card>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'touch-none',
        isDragging && !isOverlay && 'opacity-40',
      )}
    >
      <Card
        className={cn(
          'space-y-2 p-3 shadow-sm',
          isOverlay && 'rotate-2 shadow-lg ring-2 ring-primary/40',
        )}
      >
        <div className="flex gap-2">
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to start run"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 space-y-2">
            <CardBody
              card={card}
              onStartRun={onStartRun}
              starting={starting}
              draggable
              onInspect={onInspect && !isOverlay ? () => onInspect(card, columnId) : undefined}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
