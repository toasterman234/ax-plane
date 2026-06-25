'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type RequestRow = { id: string; body: string; agentId: string; createdAt: string };
type Run = { id: string; requestId: string; agentId: string; status: string };

export default function RequestsPage() {
  const [body, setBody] = useState('Create a short plan and use the fake risky tool so I can test approvals.');
  const requests = useQuery({ queryKey: ['requests'], queryFn: () => api<RequestRow[]>('/requests') });

  const createRequest = useMutation({
    mutationFn: () => api<RequestRow>('/requests', { method: 'POST', body: JSON.stringify({ body, agentId: 'demo_ax_agent' }) }),
    onSuccess: () => requests.refetch(),
  });

  async function startRun(request: RequestRow) {
    const run = await api<Run>('/runs', { method: 'POST', body: JSON.stringify({ requestId: request.id, agentId: request.agentId }) });
    window.location.href = `/runs/${run.id}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Requests</h1>
        <p className="text-slate-400">Submit work into the AxPlane inbox.</p>
      </div>
      <Card className="space-y-3">
        <textarea className="min-h-28 w-full rounded-md border border-slate-800 bg-slate-950 p-3 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>Submit request</Button>
      </Card>
      <div className="space-y-3">
        {requests.data?.map((request) => (
          <Card key={request.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-slate-500">{request.id}</div>
                <p className="mt-2">{request.body}</p>
                <div className="mt-2 text-xs text-slate-500">agent: {request.agentId}</div>
              </div>
              <Button onClick={() => startRun(request)}>Start run</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
