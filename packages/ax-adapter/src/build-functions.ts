import type { AxFunction } from '@ax-llm/ax';
import type { Repositories } from '@axplane/db';
import { listHostToolsForAgent } from '@axplane/host-tools';
import { guardedHostTool } from './guarded-tool';

/** Globally unique OpenAI-style name — cliproxy/Gemini 400 on duplicate bare names across namespaces. */
export function toAxFunctionName(qualifiedName: string): string {
  return qualifiedName.replace(/\./g, '_');
}

export function buildAxFunctions(repo: Repositories, runId: string, toolNames: string[]): AxFunction[] {
  return listHostToolsForAgent(toolNames).map((tool) => ({
    name: toAxFunctionName(tool.qualifiedName),
    description: `[${tool.qualifiedName}] ${tool.description}`,
    parameters: tool.parameters as AxFunction['parameters'],
    func: async (args: Record<string, unknown>) =>
      guardedHostTool({
        repo,
        runId,
        qualifiedName: tool.qualifiedName,
        toolArgs: args ?? {},
      }),
  }));
}
