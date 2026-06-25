'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { FlowEntry } from '@axplane/flow-canvas';
import Link from 'next/link';
import { api, API_URL } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { AxFlowDetailPanel } from './ax-flow-detail-panel';

type AxFlowsResponse = {
  flows: FlowEntry[];
  engineReachable: boolean;
  axServerUrl: string;
};

export default function AxFlowsPage() {
  const [selectedId, setSelectedId] = useState<string>('');

  const catalog = useQuery({
    queryKey: ['ax-flows'],
    queryFn: () => api<AxFlowsResponse>('/ax-flows'),
    retry: false,
  });

  const health = useQuery({
    queryKey: ['health-ax-engine'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
      const data = (await res.json()) as { axEngine?: { reachable: boolean; flowCount: number; url: string } };
      return data.axEngine;
    },
    retry: false,
  });

  const flows = catalog.data?.flows ?? [];
  const activeId = selectedId || flows[0]?.id || '';
  const active = useMemo(() => flows.find((f) => f.id === activeId) ?? null, [flows, activeId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AX Flows</h1>
        <p className="mt-1 text-slate-400">
          ax-llm <code className="text-sm">flow()</code> programs from ax-server — structure, engine run history with trace
          overlay, live SSE runs, and optional governed AxPlane runs (<code className="text-sm">runKind: axflow</code>).
        </p>
      </div>

      {catalog.isLoading ? <p className="text-sm text-slate-500">Loading flow catalog…</p> : null}
      {catalog.error ? (
        <p className="text-sm text-red-400">
          {catalog.error instanceof Error ? catalog.error.message : 'Failed to load ax-flows'}
        </p>
      ) : null}

      {!catalog.isLoading && flows.length === 0 ? (
        <Card className="p-4 text-sm text-slate-400">
          <p>No flows returned from the engine.</p>
          <p className="mt-2">
            Start ax-server in ax-sandbox (<code className="text-xs">pnpm server</code>, port{' '}
            {catalog.data?.axServerUrl ?? health.data?.url ?? '8810'}) and refresh.
          </p>
          {health.data && !health.data.reachable ? (
            <p className="mt-2 text-amber-400/90">
              API health: ax-server at {health.data.url} is not reachable ({health.data.flowCount} flows).
            </p>
          ) : null}
          <p className="mt-2">
            Graph child-runs live under{' '}
            <Link href="/workflows" className="text-sky-400 hover:underline">
              Workflows
            </Link>
            .
          </p>
        </Card>
      ) : null}

      {flows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="max-h-[80vh] space-y-2 overflow-y-auto p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {flows.length} flow{flows.length === 1 ? '' : 's'} from engine
            </p>
            {flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                onClick={() => setSelectedId(flow.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  flow.id === activeId
                    ? 'border-sky-700 bg-sky-950/30 text-slate-100'
                    : 'border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="font-medium">{flow.title || flow.id}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-500">{flow.id}</div>
                {flow.summary ? <p className="mt-1 line-clamp-2 text-xs text-slate-400">{flow.summary}</p> : null}
              </button>
            ))}
          </Card>

          {active ? <AxFlowDetailPanel flow={active} /> : null}
        </div>
      ) : null}
    </div>
  );
}
