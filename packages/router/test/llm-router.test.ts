import { describe, expect, it } from 'vitest';
import { mockLlmRouteRequest, routeRequestAsync, type RoutableAgent } from '../src/index';

const demoAgent: RoutableAgent = {
  id: 'demo_ax_agent',
  name: 'Demo Ax Agent',
  description: 'Approval and planning demo agent',
  enabled: true,
  configJson: {
    id: 'demo_ax_agent',
    name: 'Demo Ax Agent',
    signature: 'taskText:string -> answer:string',
    routing: { keywords: ['approval', 'risky', 'fake'], priority: 5, isDefault: true },
  },
};

const repoAgent: RoutableAgent = {
  id: 'repo_agent',
  name: 'Repo Agent',
  description: 'Reads repository files and docs',
  enabled: true,
  configJson: {
    id: 'repo_agent',
    name: 'Repo Agent',
    signature: 'taskText:string -> answer:string',
    routing: { keywords: ['readme', 'repo', 'file'], priority: 10 },
  },
};

describe('mockLlmRouteRequest', () => {
  it('picks the repo agent for file-oriented requests', () => {
    const decision = mockLlmRouteRequest({
      body: 'Please read README.md from the repository',
      agents: [demoAgent, repoAgent],
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBe('repo_agent');
    expect(decision.confidence).toBeGreaterThan(0);
  });
});

describe('routeRequestAsync', () => {
  it('uses keyword routing in keyword mode', async () => {
    const decision = await routeRequestAsync({
      body: 'Read README.md from the repo',
      agents: [demoAgent, repoAgent],
      routerMode: 'keyword',
    });
    expect(decision.strategy).toBe('keyword');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('uses mock LLM routing in llm mode', async () => {
    const decision = await routeRequestAsync({
      body: 'Need repository file help with README',
      agents: [demoAgent, repoAgent],
      routerMode: 'llm',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('hybrid falls back to mock LLM when keywords miss', async () => {
    const decision = await routeRequestAsync({
      body: 'Please inspect README.md in the repository',
      agents: [demoAgent, repoAgent],
      routerMode: 'hybrid',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('keyword');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('hybrid uses mock LLM on default keyword miss', async () => {
    const decision = await routeRequestAsync({
      body: 'Summarize onboarding documentation quality',
      agents: [demoAgent, repoAgent],
      routerMode: 'hybrid',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('llm');
    expect(decision.selectedAgentId).toBe('demo_ax_agent');
  });

  it('hybrid keeps keyword wins without LLM', async () => {
    const decision = await routeRequestAsync({
      body: 'Use the fake risky tool for approval testing',
      agents: [demoAgent, repoAgent],
      routerMode: 'hybrid',
      mode: 'mock',
    });
    expect(decision.strategy).toBe('keyword');
    expect(decision.selectedAgentId).toBe('demo_ax_agent');
  });
});
