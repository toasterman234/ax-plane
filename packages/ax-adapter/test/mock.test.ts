import { describe, expect, it } from 'vitest';
import { PendingApprovalError } from '@axplane/policy';
import { resolveLlmConfig } from '../src/index';

describe('ax adapter', () => {
  it('can import policy error', () => {
    const err = new PendingApprovalError('00000000-0000-0000-0000-000000000000');
    expect(err.name).toBe('PendingApprovalError');
  });

  it('resolveLlmConfig prefers AX_API_KEY', () => {
    const prev = { ...process.env };
    process.env.AX_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    expect(resolveLlmConfig().apiKey).toBe('test-key');
    process.env = prev;
  });

  it('resolveLlmConfig throws without keys', () => {
    const prev = { ...process.env };
    delete process.env.AX_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_APIKEY;
    expect(() => resolveLlmConfig()).toThrow(/API key is required/);
    process.env = prev;
  });
});
