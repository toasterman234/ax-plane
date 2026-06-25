import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { AgentConfigSchema, type AgentConfig, type ToolDescriptor } from './schema';

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
    signature: 'request:string -> answer:string, nextActions:string[]',
    contextFields: ['request'],
    tools: ['fake.projectLookup', 'fake.riskyAction'],
    policies: ['fake_risky_action_requires_approval'],
  });
}

export const demoToolDescriptors: ToolDescriptor[] = [
  {
    qualifiedName: 'fake.projectLookup',
    namespace: 'fake',
    name: 'projectLookup',
    description: 'Return deterministic fake project context for the request.',
    risk: 'safe',
    args: { query: 'string' },
  },
  {
    qualifiedName: 'fake.riskyAction',
    namespace: 'fake',
    name: 'riskyAction',
    description: 'Fake side-effecting action used to test approval gates. It does not touch external systems.',
    risk: 'risky',
    args: { reason: 'string' },
  },
];

export function getToolDescriptor(qualifiedName: string) {
  return demoToolDescriptors.find((tool) => tool.qualifiedName === qualifiedName);
}
