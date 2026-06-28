'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FlowEntry } from '@axplane/flow-canvas';
import { AxFlowEvalsPanel } from '@/components/ax-flow/ax-flow-evals-panel';
import { api } from '@/lib/api';

type AxFlowsResponse = { flows: FlowEntry[] };

/**
 * Observatory Slice F — pick an ax-flow and run LLM-judge evals without leaving the cockpit.
 */
export function ObservatoryAxFlowEvalPanel() {
  const [flowId, setFlowId] = useState('');

  const catalog = useQuery({
    queryKey: ['ax-flows'],
    queryFn: () => api<AxFlowsResponse>('/ax-flows'),
  });

  const flows = catalog.data?.flows ?? [];
  const activeId = flowId || flows[0]?.id || '';
  const activeFlow = flows.find((f) => f.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      <label className="text-xs text-muted-foreground">
        Ax-flow
        <select
          className="mt-1 block min-w-[14rem] rounded-md border border-border bg-card px-2 py-1.5 text-sm"
          value={activeId}
          onChange={(e) => setFlowId(e.target.value)}
          disabled={catalog.isLoading || flows.length === 0}
        >
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </label>

      {catalog.isError ? (
        <p className="text-sm text-red-400">
          {catalog.error instanceof Error ? catalog.error.message : 'Failed to load ax-flows'}
        </p>
      ) : null}

      {activeFlow ? (
        <AxFlowEvalsPanel flowId={activeFlow.id} stageCount={activeFlow.spec.nodes.length} />
      ) : (
        <p className="text-sm text-muted-foreground">No ax-flows available from ax-server.</p>
      )}
    </div>
  );
}
