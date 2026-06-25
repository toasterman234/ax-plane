import { describe, expect, it } from 'vitest';
import { applyDispatcherStreamEvent, deriveDispatcherTraceOverlay } from '../src/derive-dispatcher-overlay';
import type { NodeInlineDetail, TraceOverlay } from '../src/spec-to-flow';

describe('deriveDispatcherTraceOverlay', () => {
  it('marks team delegate nodes from governed events', () => {
    const overlay = deriveDispatcherTraceOverlay({
      events: [
        { type: 'dispatcher.started', payload: {} },
        {
          type: 'dispatcher.delegate',
          payload: { qualifiedName: 'team.planner', args: { goal: 'plan' } },
        },
        { type: 'dispatcher.completed', payload: {} },
      ],
      parentOutput: {},
    });
    expect(overlay.dispatcher?.status).toBe('ok');
    expect(overlay['team.planner']?.status).toBe('ok');
  });
});

describe('applyDispatcherStreamEvent', () => {
  it('maps tool-call to team node', () => {
    const overlay: TraceOverlay = {};
    const details: Record<string, NodeInlineDetail> = {};
    applyDispatcherStreamEvent(overlay, details, {
      type: 'tool-call',
      qualifiedName: 'team.coder',
      args: { task: 'fix bug' },
    });
    expect(overlay['team.coder']?.status).toBe('running');
  });
});
