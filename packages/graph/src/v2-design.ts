import type { GraphWorkflowStep } from './types';

/** Graph workflow definition version (storage). Executor runs v1 steps until Phase 3–4. */
export type GraphDefinitionVersion = 1 | 2;

export type GraphV2NodeKind = 'agent' | 'join' | 'router' | 'end';

export type GraphV2Node = {
  id: string;
  kind: GraphV2NodeKind;
  agentId?: string;
  inputTemplate?: string;
  /** Join merge policy (Phase 3). */
  merge?: 'concat_answers';
};

export type GraphV2EdgeCondition =
  | { type: 'always' }
  | { type: 'route_label'; label: string }
  | { type: 'output_contains'; stepId: string; text: string };

export type GraphV2Edge = {
  from: string;
  to: string;
  when?: GraphV2EdgeCondition;
};

export type GraphWorkflowV2Definition = {
  version: 2;
  pattern?: string;
  nodes: GraphV2Node[];
  edges: GraphV2Edge[];
};

export type GraphWorkflowDefinition = {
  version: 1;
  pattern?: string;
  steps: GraphWorkflowStep[];
};

/** Convert shipped v1 linear steps to an equivalent v2 chain (no parallelism). */
export function linearStepsToV2(
  steps: GraphWorkflowStep[],
  pattern?: string,
): GraphWorkflowV2Definition {
  const nodes: GraphV2Node[] = steps.map((step) => ({
    id: step.id,
    kind: 'agent',
    agentId: step.agentId,
    inputTemplate: step.inputTemplate,
  }));
  nodes.push({ id: '__end', kind: 'end' });

  const edges: GraphV2Edge[] = [];
  for (let i = 0; i < steps.length; i++) {
    const from = steps[i]!.id;
    const to = i + 1 < steps.length ? steps[i + 1]!.id : '__end';
    edges.push({ from, to, when: { type: 'always' } });
  }

  return { version: 2, ...(pattern ? { pattern } : {}), nodes, edges };
}

/**
 * Reference v2 DAG for classify-and-act (not executed until graph Phase 4).
 * Canonical runnable: ax-server `pattern-classify-and-act` (axflow).
 */
export const CLASSIFY_AND_ACT_GRAPH_V2: GraphWorkflowV2Definition = {
  version: 2,
  pattern: 'classify-and-act',
  nodes: [
    {
      id: 'classify',
      kind: 'agent',
      agentId: 'workflow_classify_agent',
      inputTemplate: '{{taskText}}',
    },
    { id: 'route', kind: 'router' },
    {
      id: 'bug',
      kind: 'agent',
      agentId: 'workflow_handler_bug_agent',
      inputTemplate: '{{taskText}}\n\nClassification: {{steps.classify.output.answer}}',
    },
    {
      id: 'feature',
      kind: 'agent',
      agentId: 'workflow_handler_feature_agent',
      inputTemplate: '{{taskText}}\n\nClassification: {{steps.classify.output.answer}}',
    },
    {
      id: 'question',
      kind: 'agent',
      agentId: 'workflow_handler_question_agent',
      inputTemplate: '{{taskText}}\n\nClassification: {{steps.classify.output.answer}}',
    },
    {
      id: 'escalate',
      kind: 'agent',
      agentId: 'workflow_escalate_agent',
      inputTemplate: '{{taskText}}\n\nClassification: {{steps.classify.output.answer}}',
    },
    { id: '__end', kind: 'end' },
  ],
  edges: [
    { from: 'classify', to: 'route', when: { type: 'always' } },
    { from: 'route', to: 'bug', when: { type: 'route_label', label: 'bug' } },
    { from: 'route', to: 'feature', when: { type: 'route_label', label: 'feature' } },
    { from: 'route', to: 'question', when: { type: 'route_label', label: 'question' } },
    { from: 'route', to: 'escalate', when: { type: 'route_label', label: 'escalate' } },
    { from: 'bug', to: '__end', when: { type: 'always' } },
    { from: 'feature', to: '__end', when: { type: 'always' } },
    { from: 'question', to: '__end', when: { type: 'always' } },
    { from: 'escalate', to: '__end', when: { type: 'always' } },
  ],
};

export function isGraphWorkflowV2Definition(value: unknown): value is GraphWorkflowV2Definition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GraphWorkflowV2Definition).version === 2 &&
    Array.isArray((value as GraphWorkflowV2Definition).nodes)
  );
}
