import type { EvalCriterion } from './types';

export const SMOKE_EVAL_SUITE = {
  name: 'Smoke',
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

/** @deprecated Use {@link SMOKE_EVAL_SUITE}. */
export const DEMO_EVAL_SUITE = SMOKE_EVAL_SUITE;

/** Legacy suite display name before de-demo rename. */
export const LEGACY_SMOKE_EVAL_SUITE_NAME = 'Demo smoke';
