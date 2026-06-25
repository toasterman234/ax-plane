import type { EvalCriterion } from './types';

export const DEMO_EVAL_SUITE = {
  name: 'Demo smoke',
  description: 'Fast mock-mode checks for completion, output, and approval gates.',
  cases: [
    {
      name: 'Starts mock run with safe tools',
      taskText: 'Create a short plan for testing AxPlane.',
      sortOrder: 0,
      criteria: [
        { type: 'event_type', eventType: 'run.started' },
        { type: 'tool_called', qualifiedName: 'fake.projectLookup' },
      ] satisfies EvalCriterion[],
    },
    {
      name: 'Triggers approval gate',
      taskText: 'Use the fake risky tool for approval testing.',
      sortOrder: 1,
      criteria: [
        { type: 'run_status', status: 'needs_approval' },
        { type: 'event_type', eventType: 'ax.function_call.approval_required' },
        { type: 'tool_called', qualifiedName: 'fake.riskyAction' },
      ] satisfies EvalCriterion[],
    },
    {
      name: 'Safe tool usage',
      taskText: 'Look up project context for AxPlane MVP.',
      sortOrder: 2,
      criteria: [
        { type: 'tool_called', qualifiedName: 'fake.projectLookup' },
        { type: 'output_contains', text: 'AxPlane' },
      ] satisfies EvalCriterion[],
    },
  ],
};
