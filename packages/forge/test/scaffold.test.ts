import { describe, expect, it } from 'vitest';
import { scaffoldAgentConfig, slugifyAgentId, assertValidAgentId } from '../src/scaffold';
import type { ForgeIntake } from '../src/intake-schema';

const intake: ForgeIntake = {
  task: 'Summarize repository documentation for operators',
  success: 'Concise bullets with paths',
  failure: 'No shell or writes',
  tools: ['read', 'memory'],
  judgment: 'rubric',
  volume: 'low',
  optimizeRequested: false,
  memoryInject: true,
};

describe('slugifyAgentId', () => {
  it('produces a valid agent id slug', () => {
    expect(assertValidAgentId(slugifyAgentId('Forge Smoke Agent'))).toBe('forge_smoke_agent');
  });

  it('prefixes ids that start with a digit', () => {
    expect(slugifyAgentId('123 tool')).toMatch(/^a_/);
  });
});

describe('scaffoldAgentConfig', () => {
  it('selects read and memory tools from intents', () => {
    const config = scaffoldAgentConfig({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
    });
    expect(config.tools).toContain('repo.readFile');
    expect(config.tools).toContain('memory.search');
    expect(config.tools).not.toContain('shell.run');
    expect(config.mode).toBe('normal');
  });

  it('uses rlm mode when optimize is requested', () => {
    const config = scaffoldAgentConfig({
      intake: { ...intake, optimizeRequested: true },
      agentId: 'forge_opt_agent',
      name: 'Forge Opt Agent',
    });
    expect(config.mode).toBe('rlm');
  });

  it('adds write and shell tools when requested', () => {
    const config = scaffoldAgentConfig({
      intake: { ...intake, tools: ['read', 'write', 'shell'] },
      agentId: 'forge_write_agent',
      name: 'Forge Write Agent',
    });
    expect(config.tools).toContain('repo.writeFile');
    expect(config.tools).toContain('shell.run');
  });

  it('extracts routing keywords from the task', () => {
    const config = scaffoldAgentConfig({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
    });
    expect(config.routing?.keywords).toContain('summarize');
    expect(config.routing?.keywords).toContain('documentation');
  });

  it('uses lean context policy for high volume', () => {
    const config = scaffoldAgentConfig({
      intake: { ...intake, volume: 'high' },
      agentId: 'forge_fast_agent',
      name: 'Forge Fast Agent',
    });
    expect(config.contextPolicy).toEqual({ preset: 'lean', budget: 'tight' });
    expect(config.memory?.injectLimit).toBe(3);
  });
});
