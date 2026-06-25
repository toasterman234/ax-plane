'use client';

import { useQuery } from '@tanstack/react-query';
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

export default function ApprovalsPage() {
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: () => api<Approval[]>('/approvals'), refetchInterval: 2000 });

  async function decide(id: string, decision: 'approve' | 'reject') {
    await api(`/approvals/${id}/${decision}`, { method: 'POST' });
    await approvals.refetch();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-slate-400">Human gates for approval-required tool calls.</p>
      </div>
      {approvals.data?.map((approval) => (
        <Card key={approval.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold">{approval.toolName}</div>
              <div className="text-sm text-slate-500">run {approval.runId}</div>
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
