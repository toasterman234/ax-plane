import { describe, expect, it } from 'vitest';
import { graphWorkflowToFlowSpec } from '../src/graph-to-spec';
import { specToFlow } from '../src/spec-to-flow';

describe('graphWorkflowToFlowSpec', () => {
  it('maps linear graph steps to execute steps', () => {
    const spec = graphWorkflowToFlowSpec({
      id: 'lookup_summarize',
      steps: [
        { id: 'lookup', agentId: 'workflow_lookup_agent' },
        { id: 'summarize', agentId: 'workflow_summarize_agent' },
      ],
    });
    expect(spec.nodes).toHaveLength(2);
    expect(spec.steps.map((s) => s.op)).toEqual(['execute', 'execute']);
  });
});

describe('specToFlow', () => {
  it('lays out intake, nodes, and output for a linear spec', () => {
    const spec = graphWorkflowToFlowSpec({
      id: 'demo',
      steps: [{ id: 'only', agentId: 'default_ax_agent' }],
    });
    const { nodes, edges } = specToFlow(spec);
    expect(nodes.map((n) => n.id)).toEqual(['__in', 'only', '__out']);
    expect(edges).toHaveLength(2);
  });
});
