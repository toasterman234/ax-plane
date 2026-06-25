import { describe, expect, it } from 'vitest';
import { buildForgeDraft } from '../src/workflow';

describe('buildForgeDraft', () => {
  it('combines scaffold and eval seed for complete intake', async () => {
    const { draft } = await buildForgeDraft({
      intake: {
        task: 'Summarize repo docs for operators',
        success: 'Short bullet summary with file paths',
        failure: 'Must not run shell or write files',
        tools: ['read'],
      },
      name: 'Forge Docs Agent',
      agentId: 'forge_docs_agent',
    });

    expect(draft.agentConfig.id).toBe('forge_docs_agent');
    expect(draft.agentConfig.name).toBe('Forge Docs Agent');
    expect(draft.evalCases.length).toBeGreaterThanOrEqual(4);
    expect(draft.agentConfig.runtime).toBe('ax');
  });
});
