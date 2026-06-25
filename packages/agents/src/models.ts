import { z } from 'zod';

export const AgentModelConfigSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>;

export const AgentModelsSchema = z.object({
  primary: AgentModelConfigSchema.optional(),
  fallback: AgentModelConfigSchema.optional(),
  /** @deprecated Use `primary`. Kept for default-agent.yaml compatibility. */
  default: AgentModelConfigSchema.optional(),
}).default({});

export type AgentModels = z.infer<typeof AgentModelsSchema>;

export type NormalizedAgentModels = {
  primary?: AgentModelConfig;
  fallback?: AgentModelConfig;
};

export function normalizeAgentModels(models: unknown): NormalizedAgentModels {
  const parsed = AgentModelsSchema.parse(models ?? {});
  const primary = parsed.primary ?? parsed.default;
  return {
    primary: primary && Object.keys(primary).length > 0 ? primary : undefined,
    fallback: parsed.fallback && Object.keys(parsed.fallback).length > 0 ? parsed.fallback : undefined,
  };
}

export function hasAgentModelOverride(models: unknown): boolean {
  const normalized = normalizeAgentModels(models);
  return Boolean(normalized.primary || normalized.fallback);
}
