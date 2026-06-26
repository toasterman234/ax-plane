import { describe, expect, it } from 'vitest';
import { CLASSIFY_ACT_STAGING_WORKFLOW } from '../src/bundled';
import { CLASSIFY_AND_ACT_GRAPH_V2, linearStepsToV2 } from '../src/v2-design';

describe('linearStepsToV2', () => {
  it('converts linear steps to a v2 chain', () => {
    const v2 = linearStepsToV2(CLASSIFY_ACT_STAGING_WORKFLOW.steps, 'classify-and-act');
    expect(v2.version).toBe(2);
    expect(v2.pattern).toBe('classify-and-act');
    expect(v2.nodes.filter((n) => n.kind === 'agent')).toHaveLength(2);
    expect(v2.edges).toHaveLength(2);
    expect(v2.edges[0]).toMatchObject({ from: 'classify', to: 'act' });
  });
});

describe('CLASSIFY_AND_ACT_GRAPH_V2', () => {
  it('declares router and handler branches', () => {
    const labels = CLASSIFY_AND_ACT_GRAPH_V2.edges
      .filter((e) => e.when?.type === 'route_label')
      .map((e) => (e.when as { label: string }).label);
    expect(labels.sort()).toEqual(['bug', 'escalate', 'feature', 'question']);
  });
});
