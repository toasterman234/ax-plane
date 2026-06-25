'use client';

import { graphWorkflowToFlowSpec } from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { Card } from '@/components/ui/card';

type WorkflowShape = {
  id: string;
  name: string;
  steps: Array<{ id: string; agentId: string; inputTemplate?: string }>;
};

export function WorkflowCanvasPanel({ workflow }: { workflow: WorkflowShape | null }) {
  if (!workflow || workflow.steps.length === 0) return null;

  const spec = graphWorkflowToFlowSpec(workflow);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-lg font-semibold">Topology</h2>
        <p className="text-sm text-slate-400">
          Read-only view of <span className="font-mono text-slate-300">{workflow.id}</span> — child-run steps, not ax-llm{' '}
          <code className="text-xs">flow()</code>.
        </p>
      </div>
      <div className="h-[420px] bg-slate-950">
        <FlowCanvas spec={spec} />
      </div>
    </Card>
  );
}
