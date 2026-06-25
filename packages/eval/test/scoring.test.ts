import { describe, expect, it } from 'vitest';
import { scoreEvalCase } from '../src/scoring';

describe('scoreEvalCase', () => {
  it('scores output_contains and run_completed', () => {
    const score = scoreEvalCase(
      {
        status: 'completed',
        outputJson: { answer: 'Handled request: hello world' },
        events: [],
        toolCalls: [],
      },
      [
        { type: 'run_completed' },
        { type: 'output_contains', text: 'Handled request' },
      ],
    );
    expect(score.passed).toBe(2);
    expect(score.score).toBe(100);
  });

  it('detects approval gate criteria', () => {
    const score = scoreEvalCase(
      {
        status: 'needs_approval',
        outputJson: null,
        events: [{ type: 'ax.function_call.approval_required', payloadJson: {} }],
        toolCalls: [{ qualifiedName: 'fake.riskyAction', status: 'approval_required' }],
      },
      [
        { type: 'run_status', status: 'needs_approval' },
        { type: 'tool_called', qualifiedName: 'fake.riskyAction' },
      ],
    );
    expect(score.score).toBe(100);
  });
});
