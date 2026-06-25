import { describe, expect, it, afterEach } from 'vitest';
import { describeModelResolution, resolveLlmConfig } from '../src/llm-config';

describe('resolveLlmConfig', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('inherits from environment when agent has no model overrides', () => {
    process.env.AX_API_KEY = 'test-key';
    process.env.AX_PROVIDER = 'openai';
    process.env.AX_MODEL = 'gemini-3-flash';
    process.env.AX_BASE_URL = 'http://127.0.0.1:8317/v1';

    const config = resolveLlmConfig({ models: {} });
    expect(config.model).toBe('gemini-3-flash');
    expect(config.provider).toBe('openai');
    expect(config.temperature).toBe(0);
  });

  it('uses per-agent primary model when set', () => {
    process.env.AX_API_KEY = 'test-key';
    process.env.AX_MODEL = 'gemini-3-flash';

    const config = resolveLlmConfig({
      models: {
        primary: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 },
      },
    });
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.temperature).toBe(0.2);
  });

  it('describeModelResolution reports mixed when only model is overridden', () => {
    process.env.AX_API_KEY = 'test-key';
    process.env.AX_PROVIDER = 'openai';
    process.env.AX_MODEL = 'gemini-3-flash';

    const info = describeModelResolution({
      models: { primary: { model: 'gpt-4o-mini' } },
    });
    expect(info.source).toBe('mixed');
    expect(info.model).toBe('gpt-4o-mini');
    expect(info.provider).toBe('openai');
  });

  it('describeModelResolution reports agent when provider and model are set', () => {
    process.env.AX_API_KEY = 'test-key';

    const info = describeModelResolution({
      models: { primary: { provider: 'openai', model: 'gpt-4o-mini' } },
    });
    expect(info.source).toBe('agent');
  });
});
