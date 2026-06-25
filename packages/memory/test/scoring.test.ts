import { describe, expect, it } from 'vitest';
import { formatMemoriesForPrompt, rankMemoryEntries } from '../src/scoring';

describe('memory scoring', () => {
  const entries = [
    {
      id: '1',
      agentId: 'demo_ax_agent',
      runId: null,
      content: 'Ben prefers approval-gated write tools',
      tags: ['decision', 'policy'],
      createdAt: '2026-01-01',
    },
    {
      id: '2',
      agentId: null,
      runId: null,
      content: 'AxPlane API runs on port 8797',
      tags: ['ops'],
      createdAt: '2026-01-02',
    },
  ];

  it('ranks entries by query overlap', () => {
    const ranked = rankMemoryEntries(entries, 'approval write tools', 5);
    expect(ranked[0]?.id).toBe('1');
  });

  it('formats prompt block', () => {
    const text = formatMemoriesForPrompt([entries[1]!]);
    expect(text).toContain('8797');
    expect(text).toContain('global');
  });
});
