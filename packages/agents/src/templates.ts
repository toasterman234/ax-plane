import { HOST_TOOL_CATALOG } from '@axplane/host-tools';
import { AgentConfigSchema, type AgentConfig } from './schema';

export const STARTER_READ_ONLY_TOOLS = [
  'fake.projectLookup',
  'repo.listFiles',
  'repo.readFile',
  'repo.search',
  'docs.search',
  'memory.search',
  'memory.save',
  'memory.list',
] as const;

export function buildStarterAgentConfig(input: {
  id: string;
  name: string;
  description?: string;
}): AgentConfig {
  return AgentConfigSchema.parse({
    id: input.id,
    name: input.name,
    description: input.description ?? '',
    runtime: 'ax',
    mode: 'normal',
    signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    contextFields: ['taskText'],
    contextPolicy: { preset: 'checkpointed', budget: 'balanced' },
    tools: [...STARTER_READ_ONLY_TOOLS],
    policies: ['default_allow', 'write_tool_requires_approval', 'block_secret_exfiltration'],
    models: {},
    routing: { keywords: [], priority: 0, isDefault: false },
  });
}

export function cloneAgentConfigForDuplicate(
  source: AgentConfig,
  input: { id: string; name?: string },
): AgentConfig {
  return AgentConfigSchema.parse({
    ...source,
    id: input.id,
    name: input.name ?? `${source.name} (copy)`,
    routing: {
      ...(source.routing ?? { keywords: [], priority: 0, isDefault: false }),
      isDefault: false,
    },
  });
}
