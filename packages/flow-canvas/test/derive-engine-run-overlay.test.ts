import { describe, expect, it } from 'vitest';
import { deriveEngineRunOverlay } from '../src/derive-engine-run-overlay';

describe('deriveEngineRunOverlay', () => {
  it('paints completed engine nodes', () => {
    const { overlay, details } = deriveEngineRunOverlay({
      ok: true,
      nodes: [
        {
          nodeId: 'decompose',
          output: 'findings here',
          tokens: { total: 1200, prompt: 800, completion: 400 },
        },
      ],
    });
    expect(overlay.decompose?.status).toBe('ok');
    expect(overlay.decompose?.output).toBe('findings here');
    expect(details.decompose?.totalTokens).toBe(1200);
  });
});
