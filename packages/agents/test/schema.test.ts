import { describe, expect, it } from 'vitest';
import { parseAgentConfigJson } from '../src/schema';

describe('parseAgentConfigJson', () => {
  it('parses minimal valid config', () => {
    const config = parseAgentConfigJson({
      id: 'test_agent',
      name: 'Test',
      signature: 'taskText:string -> answer:string',
      tools: ['repo.readFile'],
    });
    expect(config.id).toBe('test_agent');
    expect(config.mode).toBe('rlm');
    expect(config.tools).toEqual(['repo.readFile']);
  });

  it('rejects empty signature', () => {
    expect(() => parseAgentConfigJson({ id: 'x', name: 'X', signature: '', tools: [] })).toThrow();
  });
});
