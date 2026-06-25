import type { GraphWorkflow } from './types';

export const DEMO_GRAPH_WORKFLOW: GraphWorkflow = {
  id: 'demo_lookup_summarize',
  name: 'Lookup then summarize',
  description: 'Two-step graph: read-only lookup agent, then summarize prior output.',
  steps: [
    {
      id: 'lookup',
      agentId: 'graph_lookup_agent',
      inputTemplate: '{{taskText}}',
    },
    {
      id: 'summarize',
      agentId: 'graph_summarize_agent',
      inputTemplate:
        'Summarize the lookup results for the operator.\n\nLookup output:\n{{steps.lookup.output.answer}}',
    },
  ],
};

export const GRAPH_DEMO_AGENTS = [
  {
    id: 'graph_lookup_agent',
    name: 'Graph Lookup Agent',
    description: 'Read-only lookup step for graph demos.',
    tools: ['fake.projectLookup', 'repo.search', 'docs.search'],
  },
  {
    id: 'graph_summarize_agent',
    name: 'Graph Summarize Agent',
    description: 'Summarization step for graph demos.',
    tools: ['fake.projectLookup'],
  },
] as const;
