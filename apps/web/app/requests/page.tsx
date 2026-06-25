'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type RouteDecision = {
  selectedAgentId: string;
  reason: string;
  strategy: 'explicit' | 'keyword' | 'default' | 'manual_override';
  confidence?: number;
};

type RequestRow = {
  id: string;
  body: string;
  agentId: string;
  status: string;
  routeDecisionJson: RouteDecision | null;
  createdAt: string;
};

type Agent = { id: string; name: string; enabled: boolean };
type Run = { id: string; requestId: string; agentId: string; status: string };

function strategyLabel(strategy: RouteDecision['strategy']) {
  switch (strategy) {
    case 'keyword': return 'Keyword match';
    case 'explicit': return 'Explicit';
    case 'manual_override': return 'Override';
    default: return 'Default';
  }
}

export default function RequestsPage() {
  const [body, setBody] = useState('Create a short plan and use the fake risky tool so I can test approvals.');
  const [autoStart, setAutoStart] = useState(false);
  const [explicitAgentId, setExplicitAgentId] = useState('');
  const [overrideByRequest, setOverrideByRequest] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requests = useQuery({ queryKey: ['requests'], queryFn: () => api<RequestRow[]>('/requests') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api<Agent[]>('/agents') });

  const createRequest = useMutation({
    mutationFn: () => api<{ request: RequestRow; run?: Run; routeDecision: RouteDecision }>('/requests', {
      method: 'POST',
      body: JSON.stringify({
        body,
        autoStart,
        ...(explicitAgentId ? { agentId: explicitAgentId } : {}),
      }),
    }),
    onSuccess: (data) => {
      setError(null);
      setMessage(
        data.run
          ? `Routed to ${data.routeDecision.selectedAgentId} and started run ${data.run.id.slice(0, 8)}…`
          : `Routed to ${data.routeDecision.selectedAgentId}: ${data.routeDecision.reason}`,
      );
      void requests.refetch();
      if (data.run) window.location.href = `/runs/${data.run.id}`;
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Submit failed — is the API running?');
    },
  });

  const reroute = useMutation({
    mutationFn: ({ requestId, agentId }: { requestId: string; agentId?: string }) =>
      api<{ request: RequestRow; routeDecision: RouteDecision }>(`/requests/${requestId}/route`, {
        method: 'POST',
        body: JSON.stringify(agentId ? { agentId } : {}),
      }),
    onSuccess: () => void requests.refetch(),
  });

  async function startRun(request: RequestRow) {
    const override = overrideByRequest[request.id];
    const run = await api<Run>('/runs', {
      method: 'POST',
      body: JSON.stringify({
        requestId: request.id,
        ...(override && override !== request.agentId ? { agentId: override } : {}),
      }),
    });
    window.location.href = `/runs/${run.id}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Requests</h1>
        <p className="text-slate-400">Submit work — the router picks an agent via keywords, optional LLM routing, or defaults.</p>
      </div>

      <Card className="space-y-4">
        <textarea
          className="min-h-28 w-full rounded-md border border-slate-800 bg-slate-950 p-3 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
            Start run immediately
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-500">Force agent</span>
            <select
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
              value={explicitAgentId}
              onChange={(e) => setExplicitAgentId(e.target.value)}
            >
              <option value="">Auto-route</option>
              {(agents.data ?? []).filter((a) => a.enabled).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
        </div>
        <Button onClick={() => createRequest.mutate()} disabled={createRequest.isPending}>
          {createRequest.isPending ? 'Submitting…' : 'Submit request'}
        </Button>
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <p className="text-xs text-slate-500">
          Tip: try &quot;Read README.md from the repo&quot; vs &quot;test approval with fake risky tool&quot; — routing keywords on each agent config drive the pick.
        </p>
      </Card>

      <div className="space-y-3">
        {requests.isError ? (
          <p className="text-sm text-red-400">Could not load requests from {API_URL}</p>
        ) : null}
        {!requests.isLoading && !requests.isError && (requests.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No requests yet. Submit one above, then click <strong>Start run</strong>.</p>
        ) : null}
        {requests.data?.map((request) => {
          const route = request.routeDecisionJson;
          return (
            <Card key={request.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-500">{request.id}</div>
                  <p className="mt-2">{request.body}</p>
                  {route ? (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500">Routed to</span>
                        <Link href={`/agents/${route.selectedAgentId}`} className="font-mono text-emerald-300 hover:underline">
                          {route.selectedAgentId}
                        </Link>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                          {strategyLabel(route.strategy)}
                        </span>
                        {route.confidence !== undefined ? (
                          <span className="text-xs text-slate-500">{Math.round(route.confidence * 100)}% confidence</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-slate-400">{route.reason}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">agent: {request.agentId}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <select
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                    value={overrideByRequest[request.id] ?? request.agentId}
                    onChange={(e) => setOverrideByRequest((prev) => ({ ...prev, [request.id]: e.target.value }))}
                  >
                    {(agents.data ?? []).filter((a) => a.enabled).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      className="bg-slate-800 text-white hover:bg-slate-700"
                      onClick={() => reroute.mutate({
                        requestId: request.id,
                        agentId: overrideByRequest[request.id],
                      })}
                      disabled={reroute.isPending}
                    >
                      Re-route
                    </Button>
                    <Button onClick={() => startRun(request)}>Start run</Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
