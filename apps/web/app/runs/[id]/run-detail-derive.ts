export type RunEvent = {
  id: string;
  runId: string;
  seq: number;
  type: string;
  payloadJson: unknown;
  createdAt: string;
};

type Payload = Record<string, unknown>;

function payload(event: RunEvent): Payload {
  return (event.payloadJson && typeof event.payloadJson === 'object' ? event.payloadJson : {}) as Payload;
}

export type ToolCallView = {
  id: string;
  name: string;
  status: 'requested' | 'allowed' | 'blocked' | 'approval_required' | 'completed' | 'unknown';
  args?: unknown;
  result?: unknown;
  approvalId?: string;
  seq: number;
};

export type ApprovalView = {
  id?: string;
  toolName: string;
  status: 'pending' | 'approved' | 'rejected' | 'required';
  reason?: string;
  seq: number;
};

export type ActorTurnView = {
  seq: number;
  stage?: string;
  turn?: number;
  javascriptCode?: string;
  result?: unknown;
  raw?: unknown;
};

export function deriveToolCalls(events: RunEvent[]): ToolCallView[] {
  const byId = new Map<string, ToolCallView>();

  for (const event of events) {
    const p = payload(event);
    const toolCallId = typeof p.toolCallId === 'string' ? p.toolCallId : undefined;
    if (!toolCallId) continue;

    const existing = byId.get(toolCallId) ?? {
      id: toolCallId,
      name: String(p.qualifiedName ?? 'unknown'),
      status: 'unknown' as const,
      seq: event.seq,
    };

    if (event.type === 'ax.function_call.requested') {
      existing.status = 'requested';
      existing.args = p.args;
      existing.name = String(p.qualifiedName ?? existing.name);
    } else if (event.type === 'ax.function_call.allowed') {
      existing.status = 'allowed';
    } else if (event.type === 'ax.function_call.blocked') {
      existing.status = 'blocked';
    } else if (event.type === 'ax.function_call.approval_required') {
      existing.status = 'approval_required';
      existing.approvalId = typeof p.approvalId === 'string' ? p.approvalId : existing.approvalId;
    } else if (event.type === 'ax.function_call.completed') {
      existing.status = 'completed';
      existing.result = p.result;
    }

    existing.seq = Math.min(existing.seq, event.seq);
    byId.set(toolCallId, existing);
  }

  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function deriveApprovals(events: RunEvent[]): ApprovalView[] {
  const rows: ApprovalView[] = [];

  for (const event of events) {
    const p = payload(event);
    if (event.type === 'approval.created') {
      rows.push({
        id: typeof p.approvalId === 'string' ? p.approvalId : undefined,
        toolName: String(p.toolName ?? 'unknown'),
        status: 'pending',
        reason: typeof p.reason === 'string' ? p.reason : undefined,
        seq: event.seq,
      });
    } else if (event.type === 'approval.approved') {
      rows.push({
        id: typeof p.approvalId === 'string' ? p.approvalId : undefined,
        toolName: String(p.toolName ?? 'unknown'),
        status: 'approved',
        seq: event.seq,
      });
    } else if (event.type === 'approval.rejected') {
      rows.push({
        id: typeof p.approvalId === 'string' ? p.approvalId : undefined,
        toolName: String(p.toolName ?? 'unknown'),
        status: 'rejected',
        seq: event.seq,
      });
    } else if (event.type === 'ax.function_call.approval_required') {
      rows.push({
        id: typeof p.approvalId === 'string' ? p.approvalId : undefined,
        toolName: String(p.qualifiedName ?? 'unknown'),
        status: 'required',
        reason: typeof (p.decision as Payload)?.reason === 'string' ? (p.decision as Payload).reason as string : undefined,
        seq: event.seq,
      });
    }
  }

  return rows.sort((a, b) => a.seq - b.seq);
}

export function deriveActorTurns(events: RunEvent[]): ActorTurnView[] {
  return events
    .filter((e) => e.type === 'ax.actor_turn')
    .map((event) => {
      const p = payload(event);
      return {
        seq: event.seq,
        stage: typeof p.stage === 'string' ? p.stage : undefined,
        turn: typeof p.turn === 'number' ? p.turn : undefined,
        javascriptCode: typeof p.javascriptCode === 'string' ? p.javascriptCode : undefined,
        result: p.result ?? p.turn,
        raw: p.turn !== undefined ? undefined : p,
      };
    });
}

export function latestPayload(events: RunEvent[], type: string): Payload | null {
  const match = [...events].reverse().find((e) => e.type === type);
  return match ? payload(match) : null;
}

export function statusTone(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-600 bg-emerald-950/40 text-emerald-200';
    case 'running':
      return 'border-sky-600 bg-sky-950/40 text-sky-200';
    case 'needs_approval':
      return 'border-amber-600 bg-amber-950/40 text-amber-200';
    case 'failed':
      return 'border-red-600 bg-red-950/40 text-red-200';
    case 'cancelled':
      return 'border-border bg-muted text-muted-foreground';
    default:
      return 'border-border bg-card text-foreground';
  }
}

export function toolStatusTone(status: ToolCallView['status']): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-300';
    case 'allowed':
      return 'text-sky-300';
    case 'approval_required':
      return 'text-amber-300';
    case 'blocked':
      return 'text-red-300';
    default:
      return 'text-muted-foreground';
  }
}

export function approvalStatusTone(status: ApprovalView['status']): string {
  switch (status) {
    case 'approved':
      return 'text-emerald-300';
    case 'rejected':
      return 'text-red-300';
    case 'pending':
    case 'required':
      return 'text-amber-300';
    default:
      return 'text-muted-foreground';
  }
}
