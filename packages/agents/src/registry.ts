import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { HOST_TOOL_CATALOG } from '@axplane/host-tools';
import {
  AgentConfigSchema,
  AgentMetadataUpdateSchema,
  KNOWN_POLICIES,
  SaveAgentVersionSchema,
  parseAgentConfigJson,
  type AgentConfig,
  type AgentMetadataUpdate,
  type SaveAgentVersionInput,
  type ToolDescriptor,
} from './schema';

export { AgentConfigSchema, AgentMetadataUpdateSchema, SaveAgentVersionSchema, KNOWN_POLICIES, parseAgentConfigJson };
export type { AgentConfig, AgentMetadataUpdate, SaveAgentVersionInput, ToolDescriptor };

export function loadAgentConfig(filePath = path.resolve(process.cwd(), 'packages/agents/config/demo-agent.yaml')): AgentConfig {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);
  return AgentConfigSchema.parse(parsed);
}

export function getDemoAgentConfig(): AgentConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), 'packages/agents/config/demo-agent.yaml'),
    path.resolve(process.cwd(), '../../packages/agents/config/demo-agent.yaml'),
    path.resolve(here, '../config/demo-agent.yaml'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) return loadAgentConfig(candidate);
  }

  return AgentConfigSchema.parse({
    id: 'demo_ax_agent',
    name: 'Demo Ax Agent',
    description: 'Fallback in-memory demo agent config.',
    runtime: 'ax',
    mode: 'rlm',
    signature: 'taskText:string "the user task" -> answer:string, nextActions:string[]',
    contextFields: ['taskText'],
    tools: HOST_TOOL_CATALOG.map((tool) => tool.qualifiedName),
    policies: ['write_tool_requires_approval'],
  });
}

export const demoToolDescriptors = HOST_TOOL_CATALOG.map((tool) => ({
  qualifiedName: tool.qualifiedName,
  namespace: tool.namespace,
  name: tool.name,
  description: tool.description,
  risk: tool.risk,
  args: tool.parameters,
}));

export function getToolDescriptor(qualifiedName: string) {
  return demoToolDescriptors.find((tool) => tool.qualifiedName === qualifiedName);
}
