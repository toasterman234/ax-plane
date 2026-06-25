import type { EvalCriterion } from '@axplane/eval';
import { toAxFunctionName } from './build-functions';

export function criteriaTextFromEvalCriteria(criteria: EvalCriterion[]): string {
  if (criteria.length === 0) {
    return 'Complete the task clearly and use tools when appropriate.';
  }

  return criteria.map((criterion) => {
    switch (criterion.type) {
      case 'run_completed':
        return 'The run must complete successfully.';
      case 'run_status':
        return `The run status must be ${criterion.status}.`;
      case 'output_contains':
        return `The answer must contain "${criterion.text}".`;
      case 'tool_called':
        return `Must call tool ${criterion.qualifiedName}.`;
      case 'event_type':
        return `Must emit event ${criterion.eventType}.`;
      default:
        return 'Satisfy the task criteria.';
    }
  }).join(' ');
}

export function evalCaseToOptimizeTask(evalCase: {
  taskText: string;
  criteria: EvalCriterion[];
}) {
  const expectedActions = evalCase.criteria
    .filter((criterion): criterion is Extract<EvalCriterion, { type: 'tool_called' }> =>
      criterion.type === 'tool_called')
    .map((criterion) => toAxFunctionName(criterion.qualifiedName));

  return {
    input: { taskText: evalCase.taskText },
    criteria: criteriaTextFromEvalCriteria(evalCase.criteria),
    ...(expectedActions.length > 0 ? { expectedActions } : {}),
  };
}
