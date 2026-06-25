import { describe, expect, it } from 'vitest';
import { ControlEventTypeSchema } from '@axplane/events';

describe('db package smoke', () => {
  it('imports event schema', () => {
    expect(ControlEventTypeSchema.parse('run.started')).toBe('run.started');
  });
});
