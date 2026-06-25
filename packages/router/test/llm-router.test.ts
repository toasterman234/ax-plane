import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_ID } from '@axplane/agents';
import { mockLlmRouteRequest, routeRequestAsync, type RoutableAgent } from '../src/index';

const defaultAgent: RoutableAgent = {
  id: DEFAULT_AGENT_ID,
  name: 'Default Ax Agent',
  description: 'Approval and planning default agent',
  enabled: true,
  configJson: {
    id: DEFAULT_AGENT_ID,
    name: 'Default Ax Agent',
    signature: 'taskText:string -> answer:string',
    routing: { keywords: ['approval', 'risky', 'fake'], priority: 5, isDefault: true },
  },
};

const repoAgent: RoutableAgent = {
  id: 'repo_agent',
  name: 'Repo Agent',
  description: 'Reads files',
  enabled: true,
  configJson: {
    id: 'repo_agent',
    name: 'Repo Agent',
    signature: 'taskText:string -> answer:string',
    routing: { keywords: ['readme', 'repo', 'file'], priority: 10 },
  },
};

describe('mockLlmRouteRequest', () => {
  it('picks repo agent when body matches repo keywords', () => {
    const decision = mockLlmRouteRequest({
      body: 'Read README.md from the repo',
      agents: [defaultAgent, repoAgent],
    });
    expect(decision.selectedAgentId).toBe('repo_agent');
    expect(decision.strategy).toBe('llm');
  });

  it('uses mock LLM routing in llm mode', async () => {
    const decision = await routeRequestAsync({
      body: 'Read README.md from the repo',
      agents: [defaultAgent, repoAgent],
      routerMode: 'llm',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('hybrid falls back to mock LLM when keywords miss', async () => {
    const decision = await routeRequestAsync({
      body: 'Summarize the quarterly earnings for the board',
      agents: [defaultAgent, repoAgent],
      routerMode: 'hybrid',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBeTruthy();
  });

  it('hybrid uses mock LLM on default keyword miss', async () => {
    const decision = await routeRequestAsync({
      body: 'hello world',
      agents: [defaultAgent, repoAgent],
      routerMode: 'hybrid',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBe(DEFAULT_AGENT_ID);
  });

  it('defaults to default agent on weak body match', () => {
    const decision = mockLlmRouteRequest({
      body: 'hello',
      agents: [defaultAgent, repoAgent],
    });
    expect(decision.selectedAgentId).toBe(DEFAULT_AGENT_ID);
  });

  it('prefers default agent when both match weakly', () => {
    const decision = mockLlmRouteRequest({
      body: 'approval plan',
      agents: [defaultAgent, repoAgent],
    });
    expect(decision.selectedAgentId).toBe(DEFAULT_AGENT_ID);
  });
});
