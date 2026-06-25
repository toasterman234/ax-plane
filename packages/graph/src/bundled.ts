import type { GraphWorkflow } from './types';

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

/** @deprecated Use {@link BUNDLED_GRAPH_WORKFLOW}. */
export const DEMO_GRAPH_WORKFLOW = BUNDLED_GRAPH_WORKFLOW;

/** @deprecated Use {@link BUNDLED_WORKFLOW_AGENTS}. */
export const GRAPH_DEMO_AGENTS = BUNDLED_WORKFLOW_AGENTS;

/** @deprecated Renamed to {@link BUNDLED_GRAPH_WORKFLOW.id}. */
export const LEGACY_GRAPH_WORKFLOW_ID = 'demo_lookup_summarize';
