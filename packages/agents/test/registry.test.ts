import { describe, expect, it } from 'vitest';
import { getDefaultAgentConfig } from '../src/index';

describe('agent registry', () => {
  it('loads default config with full host tool catalog', () => {
    const config = getDefaultAgentConfig();
    expect(config.id).toBe('default_ax_agent');
    expect(config.tools.length).toBeGreaterThanOrEqual(14);
    expect(config.tools).toContain('repo.readFile');
    expect(config.tools).toContain('repo.writeFile');
  });
});
