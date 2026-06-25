'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  deriveGraphNodeDetails,
  deriveGraphTraceOverlay,
  graphWorkflowToFlowSpec,
  readGraphWorkflowId,
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

type ChildRun = {
  id: string;
  stepKey?: string | null;
  status: string;
  agentId?: string;
  outputJson?: unknown;
};

type Workflow = {
  id: string;
  name: string;
  steps: Array<{ id: string; agentId: string; inputTemplate?: string }>;
};

export function GraphRunCanvasPanel({
  run,
  events,
  children,
}: {
  run: Run;
  events: RunEvent[];
  children: ChildRun[];
}) {
  const workflowId = readGraphWorkflowId(run.inputJson);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const workflow = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api<Workflow>(`/workflows/${workflowId}`),
    enabled: Boolean(workflowId),
  });

  const overlay = useMemo(
    () =>
      deriveGraphTraceOverlay({
        events,
        children,
        parentOutput: run.outputJson,
      }),
    [events, children, run.outputJson],
  );

  const details = useMemo(() => deriveGraphNodeDetails(children), [children]);
  const spec = workflow.data ? graphWorkflowToFlowSpec(workflow.data) : null;
  const selectedChild = children.find((c) => c.stepKey === selectedStepId) ?? null;

  if (!workflowId) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Graph topology</h2>
        <p className="text-sm text-muted-foreground">
          Live step status from <span className="font-mono text-foreground">{workflowId}</span>
          {run.status === 'needs_approval' ? ' · paused for approval' : null}
        </p>
      </div>

      {workflow.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading workflow definition…</p>
      ) : workflow.error ? (
        <p className="p-4 text-sm text-red-400">
          {workflow.error instanceof Error ? workflow.error.message : 'Failed to load workflow'}
        </p>
      ) : spec ? (
        <div className="h-[440px] bg-card">
          <FlowCanvas
            spec={spec}
            overlay={overlay}
            selectedNodeId={selectedStepId}
            onNodeClick={(nodeId) => {
              if (nodeId === '__in' || nodeId === '__out') {
                setSelectedStepId(null);
                return;
              }
              setSelectedStepId(nodeId);
            }}
            details={details}
          />
        </div>
      ) : null}

      {selectedChild ? (
        <div className="border-t border-border px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{selectedChild.stepKey}</span>
            <span className="text-muted-foreground">{selectedChild.agentId}</span>
            <span className="text-muted-foreground">{selectedChild.status}</span>
            <Link href={`/runs/${selectedChild.id}`} className="text-sky-400 hover:underline">
              Open child run
            </Link>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
