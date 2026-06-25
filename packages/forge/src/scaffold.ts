import {
  AgentConfigSchema,
  AgentIdSchema,
  buildStarterAgentConfig,
  type AgentConfig,
} from '@axplane/agents';
import type { ForgeIntake } from './intake-schema';

const TOOL_BY_INTENT: Record<ForgeIntake['tools'][number], string[]> = {
  read: [
    'fake.projectLookup',
    'repo.listFiles',
    'repo.readFile',
    'repo.search',
    'docs.search',
  ],
  write: ['repo.writeFile'],
  shell: ['shell.run'],
  http: [],
  memory: ['memory.search', 'memory.save', 'memory.list'],
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'is', 'are',
  'this', 'that', 'agent', 'should', 'must', 'will', 'be', 'by', 'from', 'as', 'at',
]);

export function slugifyAgentId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
  const normalized = slug.match(/^[a-z]/) ? slug : `a_${slug}`;
  return normalized.length >= 3 ? normalized : `${normalized}_agent`.slice(0, 63);
}

export function assertValidAgentId(id: string): string {
  return AgentIdSchema.parse(id);
}

function selectTools(intents: ForgeIntake['tools']): string[] {
  const selected = new Set<string>();
  for (const intent of intents) {
    for (const tool of TOOL_BY_INTENT[intent] ?? []) {
      selected.add(tool);
    }
  }
  if (selected.size === 0) {
    for (const tool of TOOL_BY_INTENT.read) selected.add(tool);
  }
  return [...selected];
}

function extractRoutingKeywords(intake: ForgeIntake): string[] {
  if (intake.routingKeywords?.length) {
    return intake.routingKeywords.map((k) => k.toLowerCase()).slice(0, 8);
  }
  const tokens = intake.task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
  return [...new Set(tokens)].slice(0, 5);
}

export type ScaffoldAgentInput = {
  intake: ForgeIntake;
  agentId: string;
  name: string;
};

export function scaffoldAgentConfig(input: ScaffoldAgentInput): AgentConfig {
  const { intake, agentId, name } = input;
  const id = assertValidAgentId(agentId);
  const base = buildStarterAgentConfig({
    id,
    name,
    description: intake.task,
  });

  const mode = intake.optimizeRequested ? 'rlm' : 'normal';
  const tools = selectTools(intake.tools);
  const keywords = extractRoutingKeywords(intake);

  return AgentConfigSchema.parse({
    ...base,
    mode,
    description: intake.task,
    tools,
    routing: {
      keywords,
      priority: 0,
      isDefault: false,
    },
    memory: {
      kernelInject: intake.memoryInject,
      injectLimit: intake.volume === 'high' ? 3 : 5,
    },
    contextPolicy: intake.volume === 'high'
      ? { preset: 'lean', budget: 'tight' }
      : { preset: 'checkpointed', budget: 'balanced' },
  });
}
