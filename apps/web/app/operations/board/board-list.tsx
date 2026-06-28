'use client';

import Link from 'next/link';
import { ExternalLink, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { BoardCardWithColumn } from './board-types';
import { COLUMN_DOT } from './board-types';

function statusClass(status: string) {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'failed' || status === 'cancelled') return 'text-red-400';
  if (status === 'needs_approval') return 'text-amber-400';
  if (status === 'running') return 'text-sky-400';
  return 'text-muted-foreground';
}

export function BoardListView({
  cards,
  onStartRun,
  startingRequestId,
}: {
  cards: BoardCardWithColumn[];
  onStartRun: (requestId: string) => void;
  startingRequestId: string | null;
}) {
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">No cards match the current filters.</p>;
  }

  return (
    <div className="space-y-2">
      {cards.map((card) => {
        const run = card.latestRun;
        const canStart = !run && (card.columnId === 'inbox' || card.columnId === 'ready');

        return (
          <Card key={card.requestId} className="p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium">
                    <span className={cn('h-1.5 w-1.5 rounded-full', COLUMN_DOT[card.columnId] ?? 'bg-muted-foreground')} />
                    {card.columnLabel}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{card.requestId.slice(0, 8)}…</span>
                  {run ? (
                    <span className={cn('text-[10px]', statusClass(run.status))}>{run.status}</span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-sm">{card.body}</p>
                <p className="text-[10px] text-muted-foreground">
                  {card.routeDecision?.selectedAgentId ?? card.agentId}
                  {run?.workflowId ? ` · ${run.workflowId}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {canStart ? (
                  <Button
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => onStartRun(card.requestId)}
                    disabled={startingRequestId === card.requestId}
                  >
                    <Play className="h-3 w-3" aria-hidden />
                    Start run
                  </Button>
                ) : run ? (
                  <Link
                    href={`/runs/${run.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs hover:bg-muted"
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Open run
                  </Link>
                ) : null}
                {card.pendingApprovalCount > 0 ? (
                  <Link
                    href="/operations/approvals"
                    className="inline-flex h-8 items-center rounded-md border border-amber-900/40 bg-amber-950/20 px-2 text-xs text-amber-200"
                  >
                    Review
                  </Link>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
