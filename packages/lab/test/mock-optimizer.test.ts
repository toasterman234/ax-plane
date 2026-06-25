import { describe, expect, it } from 'vitest';
import { mockOptimizeAgent } from '../src/mock-optimizer';

const baseConfig = {
  id: 'demo_ax_agent',
  name: 'Demo',
  description: 'Base agent',
  runtime: 'ax' as const,
  mode: 'rlm' as const,
  signature: 'taskText:string -> answer:string',
  contextFields: ['taskText'],
  contextPolicy: { preset: 'checkpointed' as const, budget: 'balanced' as const },
  tools: [],
  policies: [],
  models: {},
  routing: { keywords: [], priority: 0, isDefault: false },
  memory: { kernelInject: true, injectLimit: 5 },
};

describe('mockOptimizeAgent', () => {
  it('returns a deterministic tweaked config without mutating input', () => {
    const result = mockOptimizeAgent({
      agentId: 'demo_ax_agent',
      agentConfig: baseConfig,
      optimizerType: 'ax-native-mock',
    });

    expect(baseConfig.description).toBe('Base agent');
    expect(result.candidateConfig.description).toContain('[Agent Lab optimized]');
    expect(result.candidateConfig.contextPolicy).toEqual({ preset: 'lean', budget: 'tight' });
    expect(result.candidateConfig.memory?.injectLimit).toBe(4);
    expect(result.artifactText).toContain('Mock optimization');
  });
});
