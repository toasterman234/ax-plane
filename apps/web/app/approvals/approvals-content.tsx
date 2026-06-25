'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Approval = {
  id: string;
  runId: string;
  toolName: string;
  reason: string;
  status: string;
  requestedActionJson: unknown;
  createdAt: string;
};

const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'all'] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function parseStatus(value: string | null): StatusFilter {
  if (value === 'approved' || value === 'rejected' || value === 'all') return value;
  return 'pending';
}

export function ApprovalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = parseStatus(searchParams.get('status'));
  const queryPath = statusFilter === 'all' ? '/approvals' : `/approvals?status=${statusFilter}`;

  const approvals = useQuery({
    queryKey: ['approvals', statusFilter],
    queryFn: () => api<Approval[]>(queryPath),
    refetchInterval: 2000,
  });

  function setStatusFilter(next: StatusFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'pending') {
      params.delete('status');
    } else {
      params.set('status', next);
    }
    const qs = params.toString();
    router.replace(qs ? `/approvals?${qs}` : '/approvals');
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    await api(`/approvals/${id}/${decision}`, { method: 'POST' });
    await approvals.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${
              statusFilter === status
                ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
                : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {approvals.isError ? (
        <p className="text-sm text-red-400">Could not load approvals — check that the API is running.</p>
      ) : null}
      {!approvals.isLoading && !approvals.isError && (approvals.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500">
          {statusFilter === 'pending' ? (
            <>
              No pending approvals. Start a run that hits a risky tool (e.g. submit a plan with &quot;fake risky tool&quot;), wait until status is{' '}
              <code>needs_approval</code>, then refresh.
            </>
          ) : (
            <>No {statusFilter === 'all' ? '' : `${statusFilter} `}approvals.</>
          )}
        </p>
      ) : null}
      {approvals.data?.map((approval) => (
        <Card key={approval.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">{approval.toolName}</div>
              <div className="text-sm text-slate-500">
                run{' '}
                <Link href={`/runs/${approval.runId}`} className="font-mono text-emerald-300 hover:underline">
                  {approval.runId}
                </Link>
              </div>
              <p className="mt-2 text-slate-300">{approval.reason}</p>
              <pre className="mt-3 rounded-md bg-slate-900 p-3 text-xs">{JSON.stringify(approval.requestedActionJson, null, 2)}</pre>
            </div>
            <div className="flex min-w-32 flex-col gap-2">
              <span className="rounded-full border border-slate-700 px-3 py-1 text-center text-sm">{approval.status}</span>
              {approval.status === 'pending' ? (
                <>
                  <Button onClick={() => decide(approval.id, 'approve')}>Approve</Button>
                  <Button className="bg-red-200 text-red-950 hover:bg-red-300" onClick={() => decide(approval.id, 'reject')}>Reject</Button>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
