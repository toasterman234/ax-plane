import { describe, expect, it } from 'vitest';
import { seedEvalCases } from '../src/eval-seed';
import type { ForgeIntake } from '../src/intake-schema';

const intake: ForgeIntake = {
  task: 'Summarize repo docs for operators',
  success: 'Short bullet summary with file paths',
  failure: 'Must not run shell or write files',
  tools: ['read'],
  judgment: 'rubric',
  volume: 'low',
  optimizeRequested: false,
  memoryInject: true,
};

describe('seedEvalCases', () => {
  it('returns at least four cases with stable names', () => {
    const cases = seedEvalCases(intake);
    expect(cases.length).toBeGreaterThanOrEqual(4);
    expect(cases[0]?.name).toBe('Golden path');
    expect(cases[1]?.name).toBe('Honors failure constraint');
  });

  it('includes golden path criteria with run_completed', () => {
    const golden = seedEvalCases(intake)[0];
    expect(golden?.criteria.some((c) => c.type === 'run_completed')).toBe(true);
    expect(golden?.criteria.some((c) => c.type === 'output_contains')).toBe(true);
  });

  it('embeds failure constraint in the second case', () => {
    const failureCase = seedEvalCases(intake)[1];
    expect(failureCase?.taskText).toContain(intake.failure);
  });

  it('adds read-tooling case when read intent is set', () => {
    const names = seedEvalCases(intake).map((c) => c.name);
    expect(names).toContain('Uses read tooling');
  });

  it('adds terse case for high volume', () => {
    const names = seedEvalCases({ ...intake, volume: 'high' }).map((c) => c.name);
    expect(names).toContain('Terse response');
  });

  it('caps output at eight cases', () => {
    const cases = seedEvalCases({ ...intake, volume: 'high', tools: ['read', 'write', 'memory'] });
    expect(cases.length).toBeLessThanOrEqual(8);
  });
});
