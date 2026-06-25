import type { FlowSpec } from './types';

export type GraphWorkflowShape = {
  id: string;
  steps: Array<{ id: string; agentId: string; inputTemplate?: string }>;
};

/** Map an AxPlane linear graph workflow to a read-only FlowSpec for the canvas. */
export function graphWorkflowToFlowSpec(workflow: GraphWorkflowShape): FlowSpec {
  return {
    id: workflow.id,
    in: { taskText: 'string' },
    out: { answer: 'string' },
    nodes: workflow.steps.map((step) => ({
      id: step.id,
      kind: 'agent',
      signature: step.agentId,
      description: step.inputTemplate,
    })),
    steps: workflow.steps.map((step) => ({
      op: 'execute',
      node: step.id,
      inputFrom: step.id,
    })),
  };
}
