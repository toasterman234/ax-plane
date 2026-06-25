import { normalizeAgentModels, type AgentConfig } from '@axplane/agents';

export type LlmConfig = {
  provider: string;
  apiKey: string;
  apiURL?: string;
  model: string;
  temperature: number;
};

export type ModelResolutionSource = 'agent' | 'env' | 'mixed';

export type ResolvedModelInfo = {
  slot: 'primary' | 'fallback';
  provider: string;
  model: string;
  temperature: number;
  apiURL?: string;
  source: ModelResolutionSource;
};

export function resolveLlmConfig(
  agentConfig?: Pick<AgentConfig, 'models'>,
  slot: 'primary' | 'fallback' = 'primary',
): LlmConfig {
  const apiKey =
    process.env.AX_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_APIKEY;

  if (!apiKey) {
    throw new Error(
      'A model API key is required for AXPLANE_EXECUTION_MODE=real. Set AX_API_KEY (cliproxy) or OPENAI_API_KEY.',
    );
  }

  const normalized = normalizeAgentModels(agentConfig?.models);
  const slotConfig = slot === 'fallback' ? normalized.fallback : normalized.primary;

  const envProvider = process.env.AX_PROVIDER ?? 'openai';
  const envModel = process.env.AX_MODEL ?? 'gpt-4o-mini';

  const provider = slotConfig?.provider ?? envProvider;
  const model = slotConfig?.model ?? envModel;
  const temperature = slotConfig?.temperature ?? 0;

  return {
    provider,
    apiKey,
    apiURL: process.env.AX_BASE_URL,
    model,
    temperature,
  };
}

export function describeModelResolution(
  agentConfig: Pick<AgentConfig, 'models'> | undefined,
  slot: 'primary' | 'fallback' = 'primary',
): ResolvedModelInfo {
  const normalized = normalizeAgentModels(agentConfig?.models);
  const slotConfig = slot === 'fallback' ? normalized.fallback : normalized.primary;

  const envProvider = process.env.AX_PROVIDER ?? 'openai';
  const envModel = process.env.AX_MODEL ?? 'gpt-4o-mini';

  const provider = slotConfig?.provider ?? envProvider;
  const model = slotConfig?.model ?? envModel;
  const temperature = slotConfig?.temperature ?? 0;

  let source: ModelResolutionSource = 'env';
  if (slotConfig && (slotConfig.provider || slotConfig.model || slotConfig.temperature !== undefined)) {
    source = slotConfig.provider && slotConfig.model ? 'agent' : 'mixed';
  }

  return {
    slot,
    provider,
    model,
    temperature,
    apiURL: process.env.AX_BASE_URL,
    source,
  };
}
