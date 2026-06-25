import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_ID } from '@axplane/agents';
import { manualOverrideDecision, routeRequest, type RoutableAgent } from '../src/index';

const defaultAgent: RoutableAgent = {
  id: DEFAULT_AGENT_ID,
  name: 'Default Ax Agent',
  description: 'Default',
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

describe('routeRequest', () => {
  it('uses explicit agent when provided', () => {
    const decision = routeRequest({
      body: 'anything',
      agents: [defaultAgent, repoAgent],
      explicitAgentId: 'repo_agent',
    });
    expect(decision.strategy).toBe('explicit');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });

  it('routes by keyword match', () => {
    const decision = routeRequest({
      body: 'Read README.md from the repo',
      agents: [defaultAgent, repoAgent],
    });
    expect(decision.strategy).toBe('keyword');
    expect(decision.selectedAgentId).toBe('repo_agent');
    expect(decision.reason).toContain('readme');
  });

  it('falls back to default agent when no keywords match', () => {
    const decision = routeRequest({
      body: 'hello world',
      agents: [defaultAgent, repoAgent],
    });
    expect(decision.strategy).toBe('default');
    expect(decision.selectedAgentId).toBe(DEFAULT_AGENT_ID);
  });

  it('builds manual override decisions', () => {
    const decision = manualOverrideDecision({
      previousAgentId: DEFAULT_AGENT_ID,
      selectedAgentId: 'repo_agent',
    });
    expect(decision.strategy).toBe('manual_override');
    expect(decision.selectedAgentId).toBe('repo_agent');
  });
});
