'use client';

import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HubShell } from '@/components/hub-shell';
import { api } from '@/lib/api';
import { useOperationsBoardStream } from '@/app/operations/board/use-operations-board-stream';

const TABS = [
  {
    href: '/operations/board',
    label: 'Board',
    match: (path: string) => path.startsWith('/operations/board'),
  },
  {
    href: '/operations/requests',
    label: 'Requests',
    match: (path: string) => path === '/operations' || path.startsWith('/operations/requests'),
  },
  {
    href: '/operations/runs',
    label: 'Runs',
    match: (path: string) => path.startsWith('/operations/runs'),
  },
  {
    href: '/operations/approvals',
    label: 'Approvals',
    match: (path: string) => path.startsWith('/operations/approvals'),
  },
] as const;

const TAB_DESCRIPTIONS: Record<string, string> = {
  board: 'Kanban view of requests with live run status, workflow kind, and approval overlays.',
  requests: 'Submit work — the router picks an agent via keywords, optional LLM routing, or defaults.',
  runs: 'Durable Ax run history with live SSE timelines on run detail.',
  approvals: 'Human gates for approval-required tool calls.',
};

function tabDescription(pathname: string): string {
  if (pathname.startsWith('/operations/board')) return TAB_DESCRIPTIONS.board;
  if (pathname.startsWith('/operations/runs')) return TAB_DESCRIPTIONS.runs;
  if (pathname.startsWith('/operations/approvals')) return TAB_DESCRIPTIONS.approvals;
  return TAB_DESCRIPTIONS.requests;
}

type ApprovalRow = { status: string };

export function OperationsHub({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const pendingApprovals = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: () => api<ApprovalRow[]>('/approvals?status=pending'),
    refetchInterval: 5000,
  });

  const boardCounts = useOperationsBoardStream('/operations/board');

  const pendingCount = pendingApprovals.data?.length ?? 0;
  const boardBadge = (boardCounts.data?.counts.activeRuns ?? 0) + (boardCounts.data?.counts.pendingApprovals ?? 0);

  const tabs = TABS.map((tab) => {
    if (tab.href === '/operations/approvals' && pendingCount > 0) {
      return { ...tab, badge: pendingCount };
    }
    if (tab.href === '/operations/board' && boardBadge > 0) {
      return { ...tab, badge: boardBadge };
    }
    return tab;
  });

  return (
    <HubShell
      title="Operations"
      description={tabDescription(pathname)}
      tabs={tabs}
      pathname={pathname}
    >
      {children}
    </HubShell>
  );
}
