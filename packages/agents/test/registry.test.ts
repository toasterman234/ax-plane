import { describe, expect, it } from 'vitest';
import { getDemoAgentConfig } from '../src/index';

describe('agent registry', () => {
  it('loads demo config fallback', () => {
    const config = getDemoAgentConfig();
    expect(config.id).toBe('demo_ax_agent');
  });
});
