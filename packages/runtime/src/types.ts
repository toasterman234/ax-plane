import type { AgentConfig, AgentRuntime } from '@axplane/agents';
import type { Repositories } from '@axplane/db';

export type RunAgentInput = {
  runId: string;
  agentConfig: AgentConfig;
  input: { taskText: string };
  repo: Repositories;
  mode?: 'mock' | 'real';
};

export interface RuntimeAdapter {
  readonly runtime: AgentRuntime;
  runAgent(input: RunAgentInput): Promise<unknown>;
}

export type RunAgentFn = (input: RunAgentInput) => Promise<unknown>;
