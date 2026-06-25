import { describe, expect, it } from 'vitest';
import { criteriaTextFromEvalCriteria, evalCaseToOptimizeTask } from '../src/optimize-tasks';

describe('optimize tasks', () => {
  it('converts eval criteria into Ax optimize task shape', () => {
    const task = evalCaseToOptimizeTask({
      taskText: 'Look up project context for AxPlane MVP.',
      criteria: [
        { type: 'tool_called', qualifiedName: 'fake.projectLookup' },
        { type: 'output_contains', text: 'AxPlane' },
      ],
    });

    expect(task.input).toEqual({ taskText: 'Look up project context for AxPlane MVP.' });
    expect(task.criteria).toContain('fake.projectLookup');
    expect(task.expectedActions).toEqual(['fake_projectLookup']);
  });

  it('builds fallback criteria text when empty', () => {
    expect(criteriaTextFromEvalCriteria([])).toContain('Complete the task');
  });
});
