import { z } from 'zod';

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  runtime: z.literal('ax').default('ax'),
  mode: z.enum(['normal', 'rlm']).default('rlm'),
  signature: z.string().min(1),
  contextFields: z.array(z.string()).default([]),
  contextPolicy: z.object({
    preset: z.enum(['full', 'adaptive', 'checkpointed', 'lean']).default('checkpointed'),
    budget: z.enum(['tight', 'balanced', 'large']).default('balanced'),
  }).default({ preset: 'checkpointed', budget: 'balanced' }),
  tools: z.array(z.string()).default([]),
  policies: z.array(z.string()).default([]),
  models: z.record(z.any()).default({}),
  routing: z.object({
    keywords: z.array(z.string()).default([]),
    priority: z.number().int().default(0),
    isDefault: z.boolean().default(false),
  }).default({ keywords: [], priority: 0, isDefault: false }),
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
