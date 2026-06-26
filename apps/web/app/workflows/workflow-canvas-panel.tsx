'use client';

import { graphWorkflowToFlowSpec, patternBlurb, patternLabel } from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { Card } from '@/components/ui/card';

type WorkflowShape = {
  id: string;
  name: string;
  pattern?: string;
  steps: Array<{ id: string; agentId: string; inputTemplate?: string }>;
};

export function WorkflowCanvasPanel({ workflow }: { workflow: WorkflowShape | null }) {
  if (!workflow || workflow.steps.length === 0) return null;

  const spec = graphWorkflowToFlowSpec(workflow);
  const pattern = patternLabel(workflow.pattern);
  const blurb = patternBlurb(workflow.pattern);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Topology</h2>
          {pattern ? (
            <span className="rounded bg-violet-950/50 px-2 py-0.5 text-xs font-medium text-violet-300">
              {pattern}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Read-only view of <span className="font-mono text-foreground">{workflow.id}</span> — child-run steps, not
          ax-llm <code className="text-xs">flow()</code>.
        </p>
        {blurb ? <p className="mt-2 text-sm text-muted-foreground">{blurb}</p> : null}
        {workflow.pattern === 'classify-and-act' ? (
          <p className="mt-2 text-xs text-amber-400/90">
            True 1→N routing on the graph lane requires conditional edges (roadmap Phase 4). Use AX Flows →
            pattern-classify-and-act for the full topology today.
          </p>
        ) : null}
      </div>
      <div className="h-[420px] bg-card">
        <FlowCanvas spec={spec} />
      </div>
    </Card>
  );
}
