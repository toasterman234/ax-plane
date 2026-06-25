import { describe, expect, it } from 'vitest';
import { getDemoAgentConfig } from '../src/index';

describe('agent registry', () => {
  it('loads demo config with full host tool catalog', () => {
    const config = getDemoAgentConfig();
    expect(config.id).toBe('demo_ax_agent');
    expect(config.tools.length).toBeGreaterThanOrEqual(14);
    expect(config.tools).toContain('repo.readFile');
    expect(config.tools).toContain('repo.writeFile');
  });
});
