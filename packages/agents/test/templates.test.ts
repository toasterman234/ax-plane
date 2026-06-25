import { describe, expect, it } from 'vitest';
import {
  AgentIdSchema,
  buildStarterAgentConfig,
  cloneAgentConfigForDuplicate,
  getDemoAgentConfig,
} from '../src/index';

describe('agent templates', () => {
  it('builds starter config with read-only tools and no default routing', () => {
    const config = buildStarterAgentConfig({
      id: 'research_agent',
      name: 'Research Agent',
      description: 'Reads docs and repo files',
    });
    expect(config.id).toBe('research_agent');
    expect(config.tools).toContain('repo.readFile');
    expect(config.tools).not.toContain('shell.run');
    expect(config.routing.isDefault).toBe(false);
    expect(config.mode).toBe('normal');
  });

  it('clones config with new id and clears default routing', () => {
    const demo = getDemoAgentConfig();
    const cloned = cloneAgentConfigForDuplicate(demo, { id: 'ops_agent', name: 'Ops Agent' });
    expect(cloned.id).toBe('ops_agent');
    expect(cloned.name).toBe('Ops Agent');
    expect(cloned.routing.isDefault).toBe(false);
    expect(cloned.tools.length).toBe(demo.tools.length);
  });

  it('validates agent id slug', () => {
    expect(AgentIdSchema.parse('research_agent')).toBe('research_agent');
    expect(() => AgentIdSchema.parse('Research')).toThrow();
    expect(() => AgentIdSchema.parse('ab')).toThrow();
  });
});
