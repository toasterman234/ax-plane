import { describe, expect, it } from 'vitest';
import { manualOverrideDecision, routeRequest, type RoutableAgent } from '../src/index';

const demoAgent: RoutableAgent = {
  id: 'demo_ax_agent',
  name: 'Demo Ax Agent',
  description: 'Demo',
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
  description: 'Reads files',
  enabled: true,
  configJson: {
    id: 'repo_agent',
    name: 'Repo Agent',
    signature: 'taskText:string -> answer:string',
    routing: { keywords: ['readme', 'repo', 'file'], priority: 10 },
  },
};

describe('routeRequest', () => {
  it('uses explicit agent when provided', () => {
    const decision = routeRequest({
      body: 'anything',
      agents: [demoAgent, repoAgent],
      explicitAgentId: 'repo_agent',
    });
    expect(decision.strategy).toBe('explicit');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('routes by keyword match', () => {
    const decision = routeRequest({
      body: 'Read README.md from the repo',
      agents: [demoAgent, repoAgent],
    });
    expect(decision.strategy).toBe('keyword');
    expect(decision.selectedAgentId).toBe('repo_agent');
    expect(decision.reason).toContain('readme');
  });

  it('falls back to default agent when no keywords match', () => {
    const decision = routeRequest({
      body: 'hello world',
      agents: [demoAgent, repoAgent],
    });
    expect(decision.strategy).toBe('default');
    expect(decision.selectedAgentId).toBe('demo_ax_agent');
  });

  it('builds manual override decisions', () => {
    const decision = manualOverrideDecision({
      previousAgentId: 'demo_ax_agent',
      selectedAgentId: 'repo_agent',
    });
    expect(decision.strategy).toBe('manual_override');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });
});
