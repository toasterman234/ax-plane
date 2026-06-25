import { describe, expect, it } from 'vitest';
import {
  ForgeIntakeSchema,
  mergeForgeIntake,
  validateIntakeForScaffold,
} from '../src/intake-schema';

const baseIntake = {
  task: 'Summarize repo docs for operators',
  success: 'Short bullet summary with file paths',
  failure: 'Must not run shell or write files',
  tools: ['read'] as ('read' | 'write' | 'shell' | 'http' | 'memory')[],
};

describe('ForgeIntakeSchema', () => {
  it('parses a complete intake', () => {
    const intake = ForgeIntakeSchema.parse(baseIntake);
    expect(intake.judgment).toBe('rubric');
    expect(intake.tools).toEqual(['read']);
  });

  it('rejects missing task', () => {
    expect(() => ForgeIntakeSchema.parse({ ...baseIntake, task: '' })).toThrow();
  });
});

describe('mergeForgeIntake', () => {
  it('merges patches and dedupes tools', () => {
    const merged = mergeForgeIntake(
      { task: 'a', tools: ['read', 'write'] },
      { tools: ['write', 'memory'] },
    );
    expect(merged.tools).toEqual(['write', 'memory']);
  });
});

describe('validateIntakeForScaffold', () => {
  it('requires task, success, and failure', () => {
    expect(() => validateIntakeForScaffold({ task: 'only task' })).toThrow();
    expect(validateIntakeForScaffold(baseIntake).task).toBe(baseIntake.task);
  });
});
