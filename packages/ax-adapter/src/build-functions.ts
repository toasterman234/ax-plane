import type { Repositories } from '@axplane/db';
import type { HostToolDefinition } from '@axplane/host-tools';
import { listHostToolsForAgent } from '@axplane/host-tools';
import { guardedHostTool } from './guarded-tool';

/** Globally unique OpenAI-style name — cliproxy/Gemini 400 on duplicate bare names across namespaces. */
export function toAxFunctionName(qualifiedName: string): string {
  return qualifiedName.replace(/\./g, '_');
}

export function buildAxFunctions(
  repo: Repositories,
  runId: string,
  toolNames: string[],
  customTools: HostToolDefinition[] = [],
) {
  return listHostToolsForAgent(toolNames, customTools).map((tool) => ({
    name: toAxFunctionName(tool.qualifiedName),
    description: `[${tool.qualifiedName}] ${tool.description}`,
    parameters: tool.parameters as import('@ax-llm/ax').AxFunction['parameters'],
    func: async (args: Record<string, unknown>) =>
      guardedHostTool({
        repo,
        runId,
        qualifiedName: tool.qualifiedName,
        toolArgs: args ?? {},
        customTools,
      }),
  }));
}
