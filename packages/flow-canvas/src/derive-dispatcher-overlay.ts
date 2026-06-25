import type { NodeInlineDetail, TraceOverlay } from './spec-to-flow';
import type { DispatcherStreamEvent } from './dispatcher-types';
import { delegateNodeId } from './dispatcher-types';

function running(output?: string): import('./spec-to-flow').NodeRunInfo {
  return { latencySec: null, ok: false, status: 'running', output };
}

function ok(output?: string, latencySec?: number | null): import('./spec-to-flow').NodeRunInfo {
  return { latencySec: latencySec ?? null, ok: true, status: 'ok', output };
}

function error(output?: string): import('./spec-to-flow').NodeRunInfo {
  return { latencySec: null, ok: false, status: 'error', output };
}

export function applyDispatcherStreamEvent(
  overlay: TraceOverlay,
  details: Record<string, NodeInlineDetail>,
  event: DispatcherStreamEvent,
): void {
  if ('error' in event && event.error) {
    overlay.dispatcher = error(event.error);
    return;
  }

  if ('delta' in event) return;

  if (!('type' in event)) return;

  if (event.type === 'route-decision') {
    overlay.dispatcher = running(
      `${event.route}${event.rationale ? ` — ${event.rationale.slice(0, 120)}` : ''}`,
    );
    return;
  }

  if (event.type === 'status') {
    overlay.dispatcher = running(event.text.slice(0, 200));
    return;
  }

  if (event.type === 'turn') {
    overlay.dispatcher = event.isError
      ? error((event.modelOutput ?? event.output ?? event.code ?? '').slice(0, 200))
      : running((event.modelOutput ?? event.output ?? event.code ?? '').slice(0, 200));
    if (event.stage) {
      details.dispatcher = {
        ...(details.dispatcher ?? {}),
        model: event.model,
        output: event.modelOutput ?? event.output,
      };
    }
    return;
  }

  if (event.type === 'tool-call') {
    const nodeId = delegateNodeId(event.qualifiedName ?? event.name);
    if (nodeId) {
      overlay[nodeId] = running(JSON.stringify(event.args ?? {}).slice(0, 160));
    }
    overlay.dispatcher = running(`delegate → ${event.qualifiedName ?? event.name ?? 'tool'}`);
    return;
  }

  if (event.type === 'assert') {
    overlay.dispatcher = running(event.text.slice(0, 200));
  }
}

type DispatcherOverlayEvent = { type: string; payload?: Record<string, unknown> };

/** Map governed dispatcher run events to canvas overlay. */
export function deriveDispatcherTraceOverlay(args: {
  events: DispatcherOverlayEvent[];
  parentOutput?: unknown;
}): TraceOverlay {
  const overlay: TraceOverlay = {};
  const live: TraceOverlay = {};
  const liveDetails: Record<string, NodeInlineDetail> = {};

  for (const event of args.events) {
    if (event.type === 'dispatcher.started') {
      overlay.dispatcher = running('Dispatcher run started');
    }
    if (event.type === 'dispatcher.route') {
      applyDispatcherStreamEvent(live, liveDetails, {
        type: 'route-decision',
        route: String(event.payload?.route ?? ''),
        rationale: String(event.payload?.rationale ?? ''),
        mechanism: String(event.payload?.mechanism ?? ''),
      });
    }
    if (event.type === 'dispatcher.status') {
      applyDispatcherStreamEvent(live, liveDetails, {
        type: 'status',
        text: String(event.payload?.text ?? ''),
      });
    }
    if (event.type === 'dispatcher.turn') {
      applyDispatcherStreamEvent(live, liveDetails, {
        type: 'turn',
        stage: event.payload?.stage as string | undefined,
        modelOutput: event.payload?.modelOutput as string | undefined,
        output: event.payload?.output as string | undefined,
        latencySec: event.payload?.latencySec as number | undefined,
        isError: event.payload?.isError as boolean | undefined,
      });
    }
    if (event.type === 'dispatcher.delegate') {
      applyDispatcherStreamEvent(live, liveDetails, {
        type: 'tool-call',
        qualifiedName: String(event.payload?.qualifiedName ?? ''),
        args: event.payload?.args,
      });
    }
    Object.assign(overlay, live);
  }

  if (args.events.some((e) => e.type === 'dispatcher.completed')) {
    overlay.dispatcher = ok('Completed');
    for (const key of Object.keys(overlay)) {
      if (key.startsWith('team.') && overlay[key]?.status === 'running') {
        overlay[key] = ok(overlay[key]?.output);
      }
    }
  }

  if (args.events.some((e) => e.type === 'dispatcher.failed')) {
    const fail = args.events.find((e) => e.type === 'dispatcher.failed');
    overlay.dispatcher = error(String(fail?.payload?.error ?? 'failed'));
  }

  const stored =
    args.parentOutput && typeof args.parentOutput === 'object'
      ? (args.parentOutput as { dispatcher?: { delegates?: TraceOverlay } }).dispatcher?.delegates
      : undefined;
  if (stored) {
    for (const [key, row] of Object.entries(stored)) {
      overlay[key] = row;
    }
  }

  return overlay;
}

export type AxDispatcherRunInput = {
  runKind: 'axdispatcher';
  query: string;
};

export function readAxDispatcherRunInput(inputJson: unknown): AxDispatcherRunInput | null {
  if (!inputJson || typeof inputJson !== 'object') return null;
  const record = inputJson as Record<string, unknown>;
  if (record.runKind !== 'axdispatcher') return null;
  return {
    runKind: 'axdispatcher',
    query: String(record.query ?? ''),
  };
}

export function isAxDispatcherRun(inputJson: unknown): boolean {
  return readAxDispatcherRunInput(inputJson) !== null;
}
