import { z } from 'zod';
import { AgentModelsSchema } from './models';

export { AgentModelConfigSchema, AgentModelsSchema, normalizeAgentModels, hasAgentModelOverride } from './models';
export type { AgentModelConfig, AgentModels, NormalizedAgentModels } from './models';

export const AgentRuntimeSchema = z.enum(['ax', 'pi']);
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>;

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  runtime: AgentRuntimeSchema.default('ax'),
  mode: z.enum(['normal', 'rlm']).default('rlm'),
  signature: z.string().min(1),
  contextFields: z.array(z.string()).default([]),
  contextPolicy: z.object({
    preset: z.enum(['full', 'adaptive', 'checkpointed', 'lean']).default('checkpointed'),
    budget: z.enum(['tight', 'balanced', 'large']).default('balanced'),
  }).default({ preset: 'checkpointed', budget: 'balanced' }),
  tools: z.array(z.string()).default([]),
  policies: z.array(z.string()).default([]),
  models: AgentModelsSchema.default({}),
  routing: z.object({
    keywords: z.array(z.string()).default([]),
    priority: z.number().int().default(0),
    isDefault: z.boolean().default(false),
  }).default({ keywords: [], priority: 0, isDefault: false }),
  memory: z.object({
    kernelInject: z.boolean().default(true),
    injectLimit: z.number().int().min(0).max(20).default(5),
  }).default({ kernelInject: true, injectLimit: 5 }),
  lab: z.object({
    optimizerType: z.string(),
    optimizedProgram: z.unknown(),
    optimizedProgramSummary: z.string().optional(),
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentMetadataUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type AgentMetadataUpdate = z.infer<typeof AgentMetadataUpdateSchema>;

/** Body for POST /agents/:id/versions — id comes from the URL. */
export const SaveAgentVersionSchema = AgentConfigSchema.omit({ id: true });

export type SaveAgentVersionInput = z.infer<typeof SaveAgentVersionSchema>;

export const KNOWN_POLICIES = [
  'default_allow',
  'write_tool_requires_approval',
  'block_secret_exfiltration',
] as const;

/** Lowercase slug: letter first, then letters, digits, underscores (3–64 chars). */
export const AgentIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{2,63}$/, 'Agent id must be lowercase slug (e.g. research_agent)');

export const CreateAgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  template: z.enum(['starter', 'demo']).default('starter'),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const DuplicateAgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
});

export type DuplicateAgentInput = z.infer<typeof DuplicateAgentSchema>;

export function parseAgentConfigJson(json: unknown): AgentConfig {
  return AgentConfigSchema.parse(json);
}

export type ToolDescriptor = {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: 'safe' | 'medium' | 'risky';
  args: Record<string, unknown>;
};
