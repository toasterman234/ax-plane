import { describe, expect, it } from 'vitest';
import { CreateGraphWorkflowSchema } from '../src/schema';

describe('CreateGraphWorkflowSchema', () => {
  it('accepts a valid workflow', () => {
    const parsed = CreateGraphWorkflowSchema.parse({
      id: 'my_pipeline',
      name: 'My pipeline',
      steps: [
        { id: 'lookup', agentId: 'workflow_lookup_agent', inputTemplate: '{{taskText}}' },
        {
          id: 'summarize',
          agentId: 'workflow_summarize_agent',
          inputTemplate: 'Summarize: {{steps.lookup.output.answer}}',
        },
      ],
    });
    expect(parsed.steps).toHaveLength(2);
  });

  it('rejects duplicate step ids', () => {
    expect(() =>
      CreateGraphWorkflowSchema.parse({
        id: 'bad_pipeline',
        name: 'Bad',
        steps: [
          { id: 'lookup', agentId: 'a1', inputTemplate: '{{taskText}}' },
          { id: 'lookup', agentId: 'a2', inputTemplate: '{{taskText}}' },
        ],
      }),
    ).toThrow(/Duplicate step id/);
  });

  it('rejects graph orchestrator as step agent', () => {
    expect(() =>
      CreateGraphWorkflowSchema.parse({
        id: 'bad_pipeline',
        name: 'Bad',
        steps: [{ id: 'run', agentId: '__graph__', inputTemplate: '{{taskText}}' }],
      }),
    ).toThrow(/graph orchestrator/);
  });
});
