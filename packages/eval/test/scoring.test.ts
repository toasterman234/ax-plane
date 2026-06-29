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

  it('scores Slice E visual routing criteria', () => {
    const snapshot = {
      status: 'completed' as const,
      outputJson: {},
      events: [],
      toolCalls: [],
      routeTier: 'complex_agentic',
      delegates: ['team.coder'],
      mapNodesVisited: ['message', 'greeting', 'classify', 'complex', 'loop', 'answer'],
    };
    const score = scoreEvalCase(snapshot, [
      { type: 'route_tier', tier: 'complex_agentic' },
      { type: 'delegate_first', qualifiedName: 'team.coder' },
      { type: 'path_includes', nodeId: 'loop' },
      { type: 'path_excludes', nodeId: 'fast' },
    ]);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(4);
  });

  it('fails path_includes when node missing', () => {
    const score = scoreEvalCase(
      {
        status: 'completed',
        outputJson: {},
        events: [],
        toolCalls: [],
        mapNodesVisited: ['message', 'greeting', 'fast'],
      },
      [{ type: 'path_includes', nodeId: 'loop' }],
    );
    expect(score.score).toBe(0);
    expect(score.results[0]?.passed).toBe(false);
  });
});
