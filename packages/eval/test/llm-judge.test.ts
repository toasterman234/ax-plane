import { describe, expect, it } from 'vitest';
import { planAxFlowEvalCalls, pickFlowOutputText } from '../src/ax-flow-evals';
import { LLM_JUDGE_SIGNATURE, normalizeFlowOutputForJudge } from '../src/llm-judge';

describe('ax-flow eval helpers', () => {
  it('pickFlowOutputText joins string fields', () => {
    expect(pickFlowOutputText({ draft: 'hello', outline: 'world' })).toBe('hello\n\nworld');
  });

  it('planAxFlowEvalCalls matches ax-sandbox formula', () => {
    expect(
      planAxFlowEvalCalls(
        { flowId: 'demo', cases: [{ id: 'c1', input: 'a', expected: 'b' }] },
        3,
      ),
    ).toEqual({ cases: 1, callsPerCase: 4, totalCalls: 4 });
  });

  it('exports judge signature for ax-server parity', () => {
    expect(LLM_JUDGE_SIGNATURE).toContain('pass:boolean');
  });

  it('caps judge output length', () => {
    const long = 'x'.repeat(25_000);
    expect(normalizeFlowOutputForJudge(long).length).toBe(20_000);
  });
});
