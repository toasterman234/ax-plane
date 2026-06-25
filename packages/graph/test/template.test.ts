import { describe, expect, it } from 'vitest';
import { resolveInputTemplate } from '../src/template';

describe('resolveInputTemplate', () => {
  it('substitutes taskText and prior step output', () => {
    const text = resolveInputTemplate('Task: {{taskText}}\nPrior: {{steps.lookup.output.answer}}', {
      taskText: 'hello',
      steps: {
        lookup: { output: { answer: 'lookup done' } },
      },
    });
    expect(text).toContain('hello');
    expect(text).toContain('lookup done');
  });
});
