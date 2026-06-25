import type { AgentRuntime } from '@axplane/agents';
import { axRuntimeAdapter } from './ax-adapter';
import { piRuntimeAdapter } from './pi-adapter';
import type { RunAgentFn, RunAgentInput, RuntimeAdapter } from './types';

const adapters: Record<AgentRuntime, RuntimeAdapter> = {
  ax: axRuntimeAdapter,
  pi: piRuntimeAdapter,
};

export function getRuntimeAdapter(runtime: AgentRuntime): RuntimeAdapter {
  const adapter = adapters[runtime];
  if (!adapter) {
    throw new Error(`Unsupported agent runtime: ${runtime}`);
  }
  return adapter;
}

export function createRunAgentFn(runtime: AgentRuntime): RunAgentFn {
  const adapter = getRuntimeAdapter(runtime);
  return (input) => adapter.runAgent(input);
}

/** Resolve adapter from agent config and execute the run. */
export async function runAgentForConfig(input: RunAgentInput): Promise<unknown> {
  return getRuntimeAdapter(input.agentConfig.runtime).runAgent(input);
}

export { axRuntimeAdapter } from './ax-adapter';
export { piRuntimeAdapter } from './pi-adapter';
