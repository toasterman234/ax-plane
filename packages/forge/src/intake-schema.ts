import { z } from 'zod';

export const ToolIntentSchema = z.enum(['read', 'write', 'shell', 'http', 'memory']);
export type ToolIntent = z.infer<typeof ToolIntentSchema>;

export const JudgmentStyleSchema = z.enum(['exact', 'rubric']);
export type JudgmentStyle = z.infer<typeof JudgmentStyleSchema>;

export const ForgeIntakeSchema = z.object({
  task: z.string().min(1, 'task is required'),
  success: z.string().min(1, 'success is required'),
  failure: z.string().min(1, 'failure is required'),
  tools: z.array(ToolIntentSchema).default(['read']),
  judgment: JudgmentStyleSchema.default('rubric'),
  volume: z.enum(['low', 'high']).default('low'),
  successExample: z.string().optional(),
  routingKeywords: z.array(z.string()).optional(),
  optimizeRequested: z.boolean().default(false),
  memoryInject: z.boolean().default(true),
});

export type ForgeIntake = z.infer<typeof ForgeIntakeSchema>;

export const PartialForgeIntakeSchema = ForgeIntakeSchema.partial();

export type PartialForgeIntake = z.infer<typeof PartialForgeIntakeSchema>;

export const FORGE_SESSION_STATUSES = [
  'intake',
  'scaffolded',
  'committed',
  'optimizing',
  'done',
  'failed',
] as const;

export type ForgeSessionStatus = (typeof FORGE_SESSION_STATUSES)[number];

export function mergeForgeIntake(
  existing: PartialForgeIntake,
  patch: PartialForgeIntake,
): PartialForgeIntake {
  const merged: PartialForgeIntake = { ...existing, ...patch };
  if (patch.tools) {
    merged.tools = [...new Set(patch.tools)];
  }
  if (patch.routingKeywords) {
    merged.routingKeywords = [...new Set(patch.routingKeywords)];
  }
  return merged;
}

export function parseForgeIntake(json: unknown): ForgeIntake {
  return ForgeIntakeSchema.parse(json);
}

export function parsePartialForgeIntake(json: unknown): PartialForgeIntake {
  return PartialForgeIntakeSchema.parse(json);
}

export function validateIntakeForScaffold(intake: PartialForgeIntake): ForgeIntake {
  return ForgeIntakeSchema.parse(intake);
}
