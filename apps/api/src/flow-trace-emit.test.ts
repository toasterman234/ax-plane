import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getFlowTraceBuffer } from '@axplane/flow-trace-bus';
import { dispatcherEventToFlowTrace, publishDispatcherEvent } from './flow-trace-emit.js';

describe('flow-trace-emit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps route-decision to route events', () => {
    const mapped = dispatcherEventToFlowTrace('run-1', {
      type: 'route-decision',
      route: 'complex_agentic',
      mechanism: 'classifier',
      rationale: 'needs delegation',
    });
    expect(mapped).toMatchObject({ runId: 'run-1', kind: 'route', route: 'complex_agentic' });
  });

  it('maps team tool-call to delegate events', () => {
    const mapped = dispatcherEventToFlowTrace('run-1', {
      type: 'tool-call',
      qualifiedName: 'team.coder',
      args: { task: 'fix ts' },
    });
    expect(mapped).toMatchObject({ kind: 'delegate', target: 'team.coder' });
  });

  it('publishDispatcherEvent appends to the bus buffer', () => {
    const before = getFlowTraceBuffer('run-test').length;
    publishDispatcherEvent('run-test', {
      type: 'tool-call',
      qualifiedName: 'team.planner',
    });
    const after = getFlowTraceBuffer('run-test');
    expect(after.length).toBeGreaterThan(before);
    expect(after.at(-1)).toMatchObject({ kind: 'delegate', target: 'team.planner' });
  });
});
