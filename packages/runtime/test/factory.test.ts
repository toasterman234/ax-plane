import { describe, expect, it } from 'vitest';
import { getRuntimeAdapter, runAgentForConfig } from '../src/factory';

const axConfig = {
  id: 'demo',
  name: 'Demo',
  description: '',
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

describe('runtime adapters', () => {
  it('returns ax adapter for ax runtime', () => {
    expect(getRuntimeAdapter('ax').runtime).toBe('ax');
  });

  it('pi adapter fails loudly when invoked', async () => {
    await expect(
      runAgentForConfig({
        runId: 'run-1',
        agentConfig: { ...axConfig, runtime: 'pi' },
        input: { taskText: 'hello' },
        repo: {} as never,
        mode: 'mock',
      }),
    ).rejects.toThrow(/PI runtime is not wired/);
  });
});
