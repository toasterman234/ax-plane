import type { LlmConfig } from './llm-config';

export function createLlm(ax: typeof import('@ax-llm/ax'), config: LlmConfig) {
  return ax.ai({
    name: config.provider,
    apiKey: config.apiKey,
    ...(config.apiURL ? { apiURL: config.apiURL } : {}),
    config: { model: config.model, temperature: config.temperature },
  } as never);
}
