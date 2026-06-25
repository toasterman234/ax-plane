import { describe, expect, it } from 'vitest';
import { ControlEventSchema } from '../src/index';

describe('ControlEventSchema', () => {
  it('validates normalized events', () => {
    const result = ControlEventSchema.parse({
      runId: '00000000-0000-0000-0000-000000000000',
      type: 'run.started',
      payload: { input: 'hello' },
    });
    expect(result.type).toBe('run.started');
  });
});
