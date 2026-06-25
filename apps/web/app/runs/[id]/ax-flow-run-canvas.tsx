'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  deriveAxFlowTraceOverlay,
  readAxFlowRunInput,
} from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import type { RunEvent } from './run-detail-derive';

type Run = {
  id: string;
  status: string;
  inputJson?: unknown;
  outputJson?: unknown;
  runKind?: string;
};

export function AxFlowRunCanvasPanel({
  run,
  events,
}: {
  run: Run;
  events: RunEvent[];
}) {
  const axInput = readAxFlowRunInput(run.inputJson);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const flowEntry = useQuery({
    queryKey: ['ax-flow-spec', axInput?.flowId],
    queryFn: () => api<{ spec: import('@axplane/flow-canvas').FlowSpec }>(`/ax-flows/${axInput!.flowId}`),
    enabled: Boolean(axInput?.flowId),
  });

  const overlay = useMemo(
    () => deriveAxFlowTraceOverlay({ events, children: [], parentOutput: run.outputJson }),
    [events, run.outputJson],
  );

  if (!axInput) return null;

  const spec = flowEntry.data?.spec;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-lg font-semibold">AxFlow topology</h2>
        <p className="text-sm text-slate-400">
          Governed ax-llm <code className="text-xs">flow()</code> run —{' '}
          <span className="font-mono text-slate-300">{axInput.flowId}</span>
        </p>
      </div>
      {flowEntry.isLoading ? (
        <p className="p-4 text-sm text-slate-500">Loading flow spec from engine…</p>
      ) : spec ? (
        <div className="h-[440px] bg-slate-950">
          <FlowCanvas
            spec={spec}
            overlay={overlay}
            selectedNodeId={selectedStepId}
            onNodeClick={(nodeId) => {
              if (nodeId === '__in' || nodeId === '__out') setSelectedStepId(null);
              else setSelectedStepId(nodeId);
            }}
          />
        </div>
      ) : (
        <p className="p-4 text-sm text-amber-400">Engine spec unavailable — is ax-server running?</p>
      )}
      <div className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        Proxied via AxPlane worker; events in run log as <code>axflow.*</code>. Engine history also on{' '}
        <Link href="/ax-flows" className="text-sky-400 hover:underline">
          AX Flows
        </Link>
        .
      </div>
    </Card>
  );
}
