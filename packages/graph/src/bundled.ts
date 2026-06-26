import type { GraphWorkflow } from './types';
import { CLASSIFY_AND_ACT_GRAPH_V2, linearStepsToV2 } from './v2-design';

export const BUNDLED_GRAPH_WORKFLOW: GraphWorkflow = {
  id: 'lookup_summarize',
  name: 'Lookup then summarize',
  description: 'Two-step graph: read-only lookup agent, then summarize prior output.',
  steps: [
    {
      id: 'lookup',
      agentId: 'workflow_lookup_agent',
      inputTemplate: '{{taskText}}',
    },
    {
      id: 'summarize',
      agentId: 'workflow_summarize_agent',
      inputTemplate:
        'Summarize the lookup results for the operator.\n\nLookup output:\n{{steps.lookup.output.answer}}',
    },
  ],
};

export const BUNDLED_WORKFLOW_AGENTS = [
  {
    id: 'workflow_lookup_agent',
    name: 'Workflow Lookup Agent',
    description: 'Read-only lookup step for bundled sample workflows.',
    tools: ['fake.projectLookup', 'repo.search', 'docs.search'],
  },
  {
    id: 'workflow_summarize_agent',
    name: 'Workflow Summarize Agent',
    description: 'Summarization step for bundled sample workflows.',
    tools: ['fake.projectLookup'],
  },
] as const;

/** Linear staging graph for classify-and-act (per-step child runs). True 1→N routing needs graph Phase 4. */
export const CLASSIFY_ACT_STAGING_WORKFLOW: GraphWorkflow = {
  id: 'pattern_classify_act_staging',
  name: 'Classify → Act (graph staging)',
  description:
    'Two-step child-run staging: classify then act. Routing to distinct handlers requires graph v2 conditional edges (Phase 4). Until then use AX Flows → pattern-classify-and-act.',
  pattern: 'classify-and-act',
  steps: [
    {
      id: 'classify',
      agentId: 'workflow_classify_agent',
      inputTemplate: '{{taskText}}',
    },
    {
      id: 'act',
      agentId: 'workflow_act_agent',
      inputTemplate:
        'You received a classified work item. Use the classification below and the original task to take exactly one concrete action.\n\nOriginal task:\n{{taskText}}\n\nClassifier output:\n{{steps.classify.output.answer}}',
    },
  ],
  definitionJson: CLASSIFY_AND_ACT_GRAPH_V2,
};

export const CLASSIFY_ACT_STAGING_AGENTS = [
  {
    id: 'workflow_classify_agent',
    name: 'Workflow Classify Agent',
    description: 'Read-only classifier: label item as bug, feature, question, or escalate (JSON in answer).',
    tools: ['fake.projectLookup', 'docs.search'],
  },
  {
    id: 'workflow_act_agent',
    name: 'Workflow Act Agent',
    description: 'Single handler step for graph staging (full routing is axflow pattern-classify-and-act).',
    tools: ['fake.projectLookup'],
  },
] as const;

export const CLASSIFY_ACT_STAGING_V2_CHAIN = linearStepsToV2(
  CLASSIFY_ACT_STAGING_WORKFLOW.steps,
  'classify-and-act',
);

/** @deprecated Use {@link BUNDLED_GRAPH_WORKFLOW}. */
export const DEMO_GRAPH_WORKFLOW = BUNDLED_GRAPH_WORKFLOW;

/** @deprecated Use {@link BUNDLED_WORKFLOW_AGENTS}. */
export const GRAPH_DEMO_AGENTS = BUNDLED_WORKFLOW_AGENTS;

/** @deprecated Renamed to {@link BUNDLED_GRAPH_WORKFLOW.id}. */
export const LEGACY_GRAPH_WORKFLOW_ID = 'demo_lookup_summarize';
