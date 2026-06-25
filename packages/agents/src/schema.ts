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
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type ToolDescriptor = {
  qualifiedName: string;
  namespace: string;
  name: string;
  description: string;
  risk: 'safe' | 'medium' | 'risky';
  args: Record<string, unknown>;
};
