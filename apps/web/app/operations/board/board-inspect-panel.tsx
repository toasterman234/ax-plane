'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Play, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useRunStream } from '@/lib/use-run-stream';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { deriveApprovals } from '@/app/runs/[id]/run-detail-derive';
import type { BoardCard, RunKind } from './board-types';
import { COLUMN_DOT } from './board-types';

const RUN_KIND_LABEL: Record<RunKind, string> = {
  agent: 'Agent',
  graph: 'Graph',
  axflow: 'AX Flow',
  axdispatcher: 'Dispatcher',
};

type RequestDetail = {
  id: string;
  body: string;
  agentId: string;
  status: string;
  routeDecisionJson: {
    selectedAgentId: string;
    reason: string;
    strategy: string;
    confidence?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

function readWorkflowId(inputJson: unknown): string | undefined {
  if (typeof inputJson !== 'object' || inputJson === null) return undefined;
  const workflowId = (inputJson as Record<string, unknown>).workflowId;
  return typeof workflowId === 'string' ? workflowId : undefined;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusClass(status: string) {
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'failed' || status === 'cancelled') return 'text-red-400';
  if (status === 'needs_approval') return 'text-amber-400';
  if (status === 'running') return 'text-sky-400';
  return 'text-muted-foreground';
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function BoardInspectPanel({
  card,
  columnId,
  columnLabel,
  onClose,
  onStartRun,
  starting,
}: {
  card: BoardCard;
  columnId: string;
  columnLabel: string;
  onClose: () => void;
  onStartRun: (requestId: string) => void;
  starting: boolean;
}) {
  const boardRun = card.latestRun;
  const canStart = !boardRun && (columnId === 'inbox' || columnId === 'ready');

  const requestDetail = useQuery({
    queryKey: ['board-inspect-request', card.requestId],
    queryFn: () => api<RequestDetail>(`/requests/${card.requestId}`),
    staleTime: Infinity,
  });

  const { run, events, children, loading: runLoading, streamConnected } = useRunStream(boardRun?.id);

  const pendingApprovals = useMemo(
    () => deriveApprovals(events).filter((row) => row.status === 'pending' || row.status === 'required'),
    [events],
  );

  const pendingCount = pendingApprovals.length || card.pendingApprovalCount;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const route = requestDetail.data?.routeDecisionJson ?? card.routeDecision;
  const recentEvents = events.slice(-6).reverse();
  const runStatus = run?.status ?? boardRun?.status ?? '—';
  const runKind = (run?.runKind ?? boardRun?.runKind ?? 'agent') as RunKind;
  const workflowId = readWorkflowId(run?.inputJson) ?? boardRun?.workflowId;
  const childRunCount = children.length || boardRun?.childRunCount || 0;

  const panel = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close inspect panel"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-inspect-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div className="min-w-0 space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium">
              <span className={cn('h-1.5 w-1.5 rounded-full', COLUMN_DOT[columnId] ?? 'bg-muted-foreground')} />
              {columnLabel}
            </span>
            <h2 id="board-inspect-title" className="font-mono text-sm font-semibold">
              {card.requestId}
            </h2>
            {boardRun && streamConnected ? (
              <p className="text-[10px] text-muted-foreground">Live run stream</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{requestDetail.data?.body ?? card.body}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
            <dl className="space-y-2">
              <MetaRow label="Agent">{route?.selectedAgentId ?? card.agentId}</MetaRow>
              <MetaRow label="Status">{requestDetail.data?.status ?? '—'}</MetaRow>
              <MetaRow label="Created">{formatWhen(requestDetail.data?.createdAt ?? card.createdAt)}</MetaRow>
              <MetaRow label="Updated">{formatWhen(requestDetail.data?.updatedAt ?? card.updatedAt)}</MetaRow>
            </dl>
          </section>

          {route ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Routing</h3>
              <dl className="space-y-2">
                <MetaRow label="Strategy">{route.strategy}</MetaRow>
                <MetaRow label="Reason">{route.reason}</MetaRow>
                {route.confidence != null ? (
                  <MetaRow label="Confidence">{Math.round(route.confidence * 100)}%</MetaRow>
                ) : null}
              </dl>
            </section>
          ) : null}

          {boardRun ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest run</h3>
              <dl className="space-y-2">
                <MetaRow label="Run ID">
                  <span className="font-mono text-xs">{boardRun.id}</span>
                </MetaRow>
                <MetaRow label="Status">
                  <span className={statusClass(runStatus)}>
                    {runLoading && !run ? 'Loading…' : runStatus}
                  </span>
                </MetaRow>
                <MetaRow label="Kind">{RUN_KIND_LABEL[runKind]}</MetaRow>
                {workflowId ? <MetaRow label="Workflow">{workflowId}</MetaRow> : null}
                {childRunCount > 0 ? (
                  <MetaRow label="Steps">{childRunCount}</MetaRow>
                ) : null}
                {run?.error ? (
                  <MetaRow label="Error">
                    <span className="text-red-400">{run.error}</span>
                  </MetaRow>
                ) : null}
              </dl>
            </section>
          ) : null}

          {pendingCount > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pending approvals ({pendingCount})
              </h3>
              <ul className="space-y-1.5">
                {pendingApprovals.map((approval) => (
                  <li
                    key={`${approval.seq}-${approval.toolName}`}
                    className="rounded-md border border-amber-900/30 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-100"
                  >
                    {approval.toolName}
                  </li>
                ))}
                {pendingApprovals.length === 0 && card.pendingApprovalCount > 0 ? (
                  <li className="text-xs text-muted-foreground">Waiting for approval events…</li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {recentEvents.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent events</h3>
              <ul className="space-y-1.5">
                {recentEvents.map((event) => (
                  <li
                    key={event.id ?? event.seq}
                    className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">#{event.seq}</span>{' '}
                    <span className="text-foreground">{event.type}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
          {canStart ? (
            <Button
              className="gap-1.5"
              onClick={() => onStartRun(card.requestId)}
              disabled={starting}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              {starting ? 'Starting…' : 'Start run'}
            </Button>
          ) : boardRun ? (
            <Link
              href={`/runs/${boardRun.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open run
            </Link>
          ) : null}
          {pendingCount > 0 ? (
            <Link
              href="/operations/approvals"
              className="inline-flex h-9 items-center rounded-md border border-amber-900/40 bg-amber-950/20 px-4 text-sm text-amber-200 hover:bg-amber-950/40"
            >
              Review approvals
            </Link>
          ) : null}
          <Button
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            onClick={onClose}
          >
            Close
          </Button>
        </footer>
      </aside>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(panel, document.body);
}
