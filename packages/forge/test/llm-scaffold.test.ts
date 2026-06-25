import { describe, expect, it } from 'vitest';
import {
  applyLlmScaffoldOutput,
  buildForgeDraftWithStrategy,
  mockLlmScaffoldDraft,
  parseLlmScaffoldJson,
} from '../src/llm-scaffold';
import type { ForgeIntake } from '../src/intake-schema';
import { scaffoldAgentConfig } from '../src/scaffold';

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

describe('mockLlmScaffoldDraft', () => {
  it('returns a valid agent config and eval cases', () => {
    const draft = mockLlmScaffoldDraft({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
    });
    expect(draft.agentConfig.signature).toContain('answer:string');
    expect(draft.agentConfig.tools).toContain('repo.readFile');
    expect(draft.evalCases.length).toBeGreaterThanOrEqual(4);
    expect(draft.evalCases.some((row) => row.name === 'Mock LLM quality bar')).toBe(true);
  });
});

describe('parseLlmScaffoldJson', () => {
  it('parses structured scaffold JSON', () => {
    const parsed = parseLlmScaffoldJson(JSON.stringify({
      signature: 'taskText:string -> answer:string',
      tools: ['repo.readFile', 'docs.search'],
      routingKeywords: ['docs'],
      evalCases: [
        {
          name: 'Case A',
          taskText: 'Do the task',
          criteria: [{ type: 'run_completed' }],
        },
        {
          name: 'Case B',
          taskText: 'Do the task with constraint',
          criteria: [{ type: 'run_completed' }],
        },
        {
          name: 'Case C',
          taskText: 'Paraphrase',
          criteria: [{ type: 'run_completed' }],
        },
      ],
    }));
    expect(parsed.tools).toContain('repo.readFile');
    expect(parsed.evalCases).toHaveLength(3);
  });
});

describe('applyLlmScaffoldOutput', () => {
  it('filters unknown tools to the host catalog', () => {
    const heuristicConfig = scaffoldAgentConfig({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
    });
    const applied = applyLlmScaffoldOutput({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
      heuristicConfig,
      llm: {
        signature: 'taskText:string -> answer:string, notes:string',
        tools: ['repo.readFile', 'not.a.real.tool'],
        routingKeywords: ['documentation'],
        evalCases: [
          { name: 'A', taskText: 't1', criteria: [{ type: 'run_completed' }] },
          { name: 'B', taskText: 't2', criteria: [{ type: 'run_completed' }] },
          { name: 'C', taskText: 't3', criteria: [{ type: 'run_completed' }] },
        ],
      },
    });
    expect(applied.agentConfig.tools).toContain('repo.readFile');
    expect(applied.agentConfig.tools).not.toContain('not.a.real.tool');
    expect(applied.agentConfig.routing?.keywords).toContain('documentation');
  });
});

describe('buildForgeDraftWithStrategy', () => {
  it('uses heuristic strategy by default', async () => {
    const { draft, meta } = await buildForgeDraftWithStrategy({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
    });
    expect(meta.strategy).toBe('heuristic');
    expect(meta.usedFallback).toBe(false);
    expect(draft.evalCases.length).toBeGreaterThanOrEqual(4);
  });

  it('uses mock llm strategy without API keys', async () => {
    const { draft, meta } = await buildForgeDraftWithStrategy({
      intake,
      agentId: 'forge_docs_agent',
      name: 'Forge Docs Agent',
      strategy: 'llm',
      mode: 'mock',
    });
    expect(meta.strategy).toBe('llm');
    expect(meta.mode).toBe('mock');
    expect(meta.usedFallback).toBe(false);
    expect(draft.evalCases.some((row) => row.name === 'Mock LLM quality bar')).toBe(true);
  });
});
