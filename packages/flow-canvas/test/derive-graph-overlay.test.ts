import { describe, expect, it } from 'vitest';
import { deriveGraphTraceOverlay } from '../src/derive-graph-overlay';

describe('deriveGraphTraceOverlay', () => {
  it('marks completed child steps as ok with output', () => {
    const overlay = deriveGraphTraceOverlay({
      events: [
        { type: 'graph.step.started', payloadJson: { stepId: 'lookup' } },
        { type: 'graph.step.completed', payloadJson: { stepId: 'lookup', status: 'completed' } },
      ],
      children: [
        {
          id: 'child-1',
          stepKey: 'lookup',
          status: 'completed',
          outputJson: { answer: 'found it' },
        },
      ],
    });
    expect(overlay.lookup).toMatchObject({ status: 'ok', ok: true, output: 'found it' });
  });

  it('marks in-flight step as running when started but not completed', () => {
    const overlay = deriveGraphTraceOverlay({
      events: [{ type: 'graph.step.started', payloadJson: { stepId: 'summarize' } }],
      children: [{ id: 'child-2', stepKey: 'summarize', status: 'running' }],
    });
    expect(overlay.summarize?.status).toBe('running');
  });

  it('marks failed steps from graph.failed', () => {
    const overlay = deriveGraphTraceOverlay({
      events: [{ type: 'graph.failed', payloadJson: { stepId: 'lookup', message: 'boom' } }],
      children: [],
    });
    expect(overlay.lookup).toMatchObject({ status: 'error', ok: false });
  });
});
