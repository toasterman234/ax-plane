import { describe, expect, it } from 'vitest';
import { normalizeAgentModels } from '../src/models';

describe('normalizeAgentModels', () => {
  it('maps legacy default slot to primary', () => {
    const normalized = normalizeAgentModels({
      default: { provider: 'openai', model: 'gpt-4o-mini' },
    });
    expect(normalized.primary).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('prefers explicit primary over default', () => {
    const normalized = normalizeAgentModels({
      default: { model: 'old' },
      primary: { model: 'new', provider: 'openai' },
    });
    expect(normalized.primary?.model).toBe('new');
  });

  it('treats empty slots as undefined', () => {
    expect(normalizeAgentModels({ primary: {} }).primary).toBeUndefined();
  });
});
