import { describe, expect, it } from 'vitest';
import { deriveApprovals, deriveToolCalls } from './run-detail-derive';

const events = [
  {
    id: '1',
    runId: 'run',
    seq: 3,
    type: 'ax.function_call.requested',
    payloadJson: { toolCallId: 'tc1', qualifiedName: 'fake.projectLookup', args: { query: 'hi' } },
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    runId: 'run',
    seq: 4,
    type: 'ax.function_call.allowed',
    payloadJson: { toolCallId: 'tc1', qualifiedName: 'fake.projectLookup' },
    createdAt: '2026-01-01T00:00:01Z',
  },
  {
    id: '3',
    runId: 'run',
    seq: 5,
    type: 'ax.function_call.completed',
    payloadJson: { toolCallId: 'tc1', qualifiedName: 'fake.projectLookup', result: { ok: true } },
    createdAt: '2026-01-01T00:00:02Z',
  },
  {
    id: '4',
    runId: 'run',
    seq: 8,
    type: 'approval.created',
    payloadJson: { approvalId: 'ap1', toolName: 'fake.riskyAction', reason: 'needs approval' },
    createdAt: '2026-01-01T00:00:03Z',
  },
] as const;

describe('run-detail-derive', () => {
  it('groups tool call lifecycle into one row', () => {
    const tools = deriveToolCalls([...events]);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('fake.projectLookup');
    expect(tools[0]?.status).toBe('completed');
    expect(tools[0]?.result).toEqual({ ok: true });
  });

  it('extracts approval rows', () => {
    const approvals = deriveApprovals([...events]);
    expect(approvals.some((a) => a.toolName === 'fake.riskyAction' && a.status === 'pending')).toBe(true);
  });
});
