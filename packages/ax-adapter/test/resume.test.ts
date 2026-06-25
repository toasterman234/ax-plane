import { describe, expect, it } from 'vitest';
import { readRunResume } from '../src/resume';

describe('readRunResume', () => {
  it('parses resume checkpoint from run input', () => {
    const resume = readRunResume({
      taskText: 'hello',
      resume: {
        approvalId: 'ap-1',
        toolCallId: 'tc-1',
        qualifiedName: 'fake.riskyAction',
        toolArgs: { reason: 'test' },
      },
    });
    expect(resume?.qualifiedName).toBe('fake.riskyAction');
    expect(resume?.toolCallId).toBe('tc-1');
  });
});
