import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { HOST_TOOL_CATALOG } from '@axplane/host-tools';
import { DEFAULT_AGENT_ID } from './constants';
import {
  AgentConfigSchema,
  AgentIdSchema,
  AgentMetadataUpdateSchema,
  CreateAgentSchema,
  DuplicateAgentSchema,
  KNOWN_POLICIES,
  SaveAgentVersionSchema,
  parseAgentConfigJson,
  type AgentConfig,
  type AgentMetadataUpdate,
  type CreateAgentInput,
  type DuplicateAgentInput,
  type SaveAgentVersionInput,
  type ToolDescriptor,
} from './schema';

export {
  AgentConfigSchema,
  AgentIdSchema,
  AgentMetadataUpdateSchema,
  CreateAgentSchema,
  DuplicateAgentSchema,
  KNOWN_POLICIES,
  SaveAgentVersionSchema,
  parseAgentConfigJson,
};
export type {
  AgentConfig,
  AgentMetadataUpdate,
  CreateAgentInput,
  DuplicateAgentInput,
  SaveAgentVersionInput,
  ToolDescriptor,
} from './schema';
export {
  AgentModelConfigSchema,
  AgentModelsSchema,
  normalizeAgentModels,
  hasAgentModelOverride,
} from './models';
export type { AgentModelConfig, AgentModels, NormalizedAgentModels } from './models';
export {
  STARTER_READ_ONLY_TOOLS,
  buildStarterAgentConfig,
  cloneAgentConfigForDuplicate,
} from './templates';
export { DEFAULT_AGENT_ID, LEGACY_DEMO_AGENT_ID } from './constants';

const DEFAULT_CONFIG_FILENAME = 'default-agent.yaml';
const LEGACY_CONFIG_FILENAME = 'demo-agent.yaml';

export function loadAgentConfig(
  filePath = path.resolve(process.cwd(), `packages/agents/config/${DEFAULT_CONFIG_FILENAME}`),
): AgentConfig {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);
  return AgentConfigSchema.parse(parsed);
}

export function getDefaultAgentConfig(): AgentConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), `packages/agents/config/${DEFAULT_CONFIG_FILENAME}`),
    path.resolve(process.cwd(), `../../packages/agents/config/${DEFAULT_CONFIG_FILENAME}`),
    path.resolve(here, `../config/${DEFAULT_CONFIG_FILENAME}`),
    path.resolve(process.cwd(), `packages/agents/config/${LEGACY_CONFIG_FILENAME}`),
    path.resolve(process.cwd(), `../../packages/agents/config/${LEGACY_CONFIG_FILENAME}`),
    path.resolve(here, `../config/${LEGACY_CONFIG_FILENAME}`),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) return loadAgentConfig(candidate);
  }

  return AgentConfigSchema.parse({
    id: DEFAULT_AGENT_ID,
    name: 'Default Ax Agent',
    description: 'Fallback in-memory default agent config.',
    runtime: 'ax',
    mode: 'rlm',
    signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    contextFields: ['taskText'],
    tools: HOST_TOOL_CATALOG.map((tool) => tool.qualifiedName),
    policies: ['write_tool_requires_approval'],
  });
}

/** @deprecated Use {@link getDefaultAgentConfig}. */
export const getDemoAgentConfig = getDefaultAgentConfig;

export function buildFullCatalogAgentConfig(input: {
  id: string;
  name: string;
  description?: string;
}): AgentConfig {
  const base = getDefaultAgentConfig();
  return AgentConfigSchema.parse({
    ...base,
    id: input.id,
    name: input.name,
    description: input.description ?? base.description,
    tools: HOST_TOOL_CATALOG.map((tool) => tool.qualifiedName),
    routing: {
      ...base.routing,
      keywords: [...(base.routing?.keywords ?? [])],
      isDefault: false,
    },
  });
}

/** @deprecated Use {@link buildFullCatalogAgentConfig}. */
export const buildDemoTemplateAgentConfig = buildFullCatalogAgentConfig;

export const catalogToolDescriptors = HOST_TOOL_CATALOG.map((tool) => ({
  qualifiedName: tool.qualifiedName,
  namespace: tool.namespace,
  name: tool.name,
  description: tool.description,
  risk: tool.risk,
  args: tool.parameters,
}));

/** @deprecated Use {@link catalogToolDescriptors}. */
export const demoToolDescriptors = catalogToolDescriptors;

export function getToolDescriptor(qualifiedName: string) {
  return catalogToolDescriptors.find((tool) => tool.qualifiedName === qualifiedName);
}
