import type { FlowEntry, FlowSpec } from './types';

/** Static topology for ax-server `buildDispatcher()` team delegation (show mode). */
export const DISPATCHER_FLOW_SPEC: FlowSpec = {
  id: 'ax-dispatcher',
  in: { query: 'string' },
  out: { answer: 'string' },
  nodes: [
    {
      id: 'dispatcher',
      kind: 'agent',
      signature: 'query -> answer',
      description: 'RLM orchestrator — routes, plans, delegates to team.* specialists',
    },
    {
      id: 'team.planner',
      kind: 'agent',
      signature: 'goal -> steps[]',
      description: 'Decomposes goals into ordered steps',
      dependsOn: ['dispatcher'],
    },
    {
      id: 'team.coder',
      kind: 'agent',
      signature: 'task -> code',
      description: 'Writes or reviews code',
      dependsOn: ['dispatcher'],
    },
    {
      id: 'team.researcher',
      kind: 'agent',
      signature: 'question -> answer',
      description: 'Research from training knowledge (no live web in team agent)',
      dependsOn: ['dispatcher'],
    },
  ],
  steps: [
    { op: 'execute', node: 'dispatcher', inputFrom: 'query' },
    { op: 'returns', from: 'dispatcher' },
  ],
};

export const DISPATCHER_FLOW_ENTRY: FlowEntry = {
  id: 'ax-dispatcher',
  title: 'Ax dispatcher (team orchestrator)',
  summary:
    'Proxied ax-server /dispatcher — dynamic RLM supervisor with team.planner, team.coder, team.researcher child agents.',
  spec: DISPATCHER_FLOW_SPEC,
};
