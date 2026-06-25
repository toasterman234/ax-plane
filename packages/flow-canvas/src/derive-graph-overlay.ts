import type { NodeInlineDetail, TraceOverlay } from './spec-to-flow';

export type GraphOverlayEvent = {
  type: string;
  payloadJson: unknown;
};

export type GraphOverlayChild = {
  id: string;
  stepKey?: string | null;
  status: string;
  outputJson?: unknown;
};

export type GraphOverlayInput = {
  events: GraphOverlayEvent[];
  children: GraphOverlayChild[];
  parentOutput?: unknown;
};

function extractAnswer(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined;
  if (typeof output === 'object' && output !== null && 'answer' in output) {
    return String((output as { answer: unknown }).answer);
  }
  if (typeof output === 'string') return output;
  return undefined;
}

/** Map graph run events + child runs to a canvas trace overlay. */
export function deriveGraphTraceOverlay(input: GraphOverlayInput): TraceOverlay {
  const overlay: TraceOverlay = {};
  const started = new Set<string>();
  const completed = new Set<string>();

  for (const event of input.events) {
    const payload =
      event.payloadJson && typeof event.payloadJson === 'object'
        ? (event.payloadJson as Record<string, unknown>)
        : null;
    if (!payload) continue;

    const stepId = typeof payload.stepId === 'string' ? payload.stepId : null;
    if (!stepId) continue;

    if (event.type === 'graph.step.started') started.add(stepId);
    if (event.type === 'graph.step.completed') completed.add(stepId);
    if (event.type === 'graph.failed') {
      overlay[stepId] = { latencySec: null, ok: false, status: 'error' };
    }
  }

  for (const child of input.children) {
    const stepId = child.stepKey;
    if (!stepId) continue;
    const output = extractAnswer(child.outputJson);
    if (child.status === 'failed') {
      overlay[stepId] = { latencySec: null, ok: false, status: 'error', output };
      continue;
    }
    if (child.status === 'completed') {
      overlay[stepId] = { latencySec: null, ok: true, status: 'ok', output };
      continue;
    }
    if (child.status === 'needs_approval') {
      overlay[stepId] = { latencySec: null, ok: true, status: 'running', output };
      continue;
    }
    if (child.status === 'running' || child.status === 'queued') {
      overlay[stepId] = { latencySec: null, ok: true, status: 'running' };
    }
  }

  for (const stepId of started) {
    if (!completed.has(stepId) && !overlay[stepId]) {
      overlay[stepId] = { latencySec: null, ok: true, status: 'running' };
    }
  }

  const parentGraph =
    input.parentOutput && typeof input.parentOutput === 'object' && input.parentOutput !== null
      ? (input.parentOutput as { graph?: { steps?: Record<string, { output?: unknown; status?: string }> } }).graph
      : undefined;

  if (parentGraph?.steps) {
    for (const [stepId, row] of Object.entries(parentGraph.steps)) {
      const output = extractAnswer(row.output);
      const failed = row.status === 'failed';
      const existing = overlay[stepId];
      if (!existing) {
        overlay[stepId] = {
          latencySec: null,
          ok: !failed,
          status: failed ? 'error' : 'ok',
          output,
        };
      } else if (output && !existing.output) {
        overlay[stepId] = { ...existing, output };
      }
    }
  }

  return overlay;
}

export function deriveGraphNodeDetails(
  children: GraphOverlayChild[],
): Record<string, NodeInlineDetail> {
  const details: Record<string, NodeInlineDetail> = {};
  for (const child of children) {
    const stepId = child.stepKey;
    if (!stepId || child.status !== 'completed') continue;
    const output = extractAnswer(child.outputJson);
    if (output) {
      details[stepId] = { output };
    }
  }
  return details;
}

export function readGraphWorkflowId(inputJson: unknown): string | null {
  if (!inputJson || typeof inputJson !== 'object') return null;
  const record = inputJson as Record<string, unknown>;
  if (record.runKind === 'graph' && typeof record.workflowId === 'string') return record.workflowId;
  return null;
}

export function isGraphParentRun(run: { runKind?: string; inputJson?: unknown } | null): boolean {
  if (!run) return false;
  if (run.runKind === 'graph') return true;
  return readGraphWorkflowId(run.inputJson) !== null;
}

/** Map AxPlane axflow run events to canvas overlay (governed runs in Postgres). */
export function deriveAxFlowTraceOverlay(input: GraphOverlayInput): TraceOverlay {
  const overlay: TraceOverlay = {};
  const started = new Set<string>();
  const completed = new Set<string>();

  for (const event of input.events) {
    const payload =
      event.payloadJson && typeof event.payloadJson === 'object'
        ? (event.payloadJson as Record<string, unknown>)
        : null;
    if (!payload) continue;
    const stepId = typeof payload.stepId === 'string' ? payload.stepId : null;
    if (!stepId) continue;

    if (event.type === 'axflow.step.started') started.add(stepId);
    if (event.type === 'axflow.step.completed') {
      completed.add(stepId);
      overlay[stepId] = {
        latencySec: typeof payload.latencySec === 'number' ? payload.latencySec : null,
        ok: true,
        status: 'ok',
        output: typeof payload.output === 'string' ? payload.output : undefined,
      };
    }
    if (event.type === 'axflow.failed') {
      overlay[stepId] = { latencySec: null, ok: false, status: 'error' };
    }
  }

  for (const stepId of started) {
    if (!completed.has(stepId) && !overlay[stepId]) {
      overlay[stepId] = { latencySec: null, ok: true, status: 'running' };
    }
  }

  const axflow =
    input.parentOutput && typeof input.parentOutput === 'object' && input.parentOutput !== null
      ? (input.parentOutput as { axflow?: { steps?: TraceOverlay } }).axflow
      : undefined;
  if (axflow?.steps) {
    for (const [stepId, row] of Object.entries(axflow.steps)) {
      if (!overlay[stepId]) overlay[stepId] = row;
      else if (row.output && !overlay[stepId].output) overlay[stepId] = { ...overlay[stepId], ...row };
    }
  }

  return overlay;
}
