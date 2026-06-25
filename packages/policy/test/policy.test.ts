import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/index';

describe('evaluatePolicy', () => {
  it('requires approval for fake risky action', () => {
    const result = evaluatePolicy({ runId: 'r1', qualifiedName: 'fake.riskyAction', args: {} });
    expect(result.decision).toBe('approval_required');
  });

  it('allows safe fake lookup', () => {
    const result = evaluatePolicy({ runId: 'r1', qualifiedName: 'fake.projectLookup', args: {} });
    expect(result.decision).toBe('allow');
  });
});
