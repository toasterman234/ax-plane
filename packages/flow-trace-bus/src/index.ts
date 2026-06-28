/**
 * In-process pub/sub for LIVE conversation-flow tracing (Observatory Slice A).
 *
 * One contract — `FlowTraceEvent` — for chat, governed runs, and eval replay.
 * The API layer parses each dispatcher SSE event and `publish()`es the
 * structured routing fact onto this bus; the Observatory canvas subscribes
 * over SSE (`GET /api/flow-trace/stream`) and draws it live.
 *
 * Adapted from `~/ax/studio/lib/flow-trace-bus.ts` — same side-channel,
 * fire-and-forget philosophy (a broken subscriber must never break the chat
 * turn), but rebuilt around a Node `EventEmitter`, run-scoped via `runId`,
 * and with no durable JSONL store (replay buffer only; durability is a later
 * slice's concern). Single-process only: AxPlane's API is one Hono server, so
 * a module singleton hung off `globalThis` (survives tsx watch reloads) is
 * all that's needed. A small ring buffer lets a canvas opened mid-run catch up.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

/** Discriminated union of everything the conversation canvas can draw. */
export type FlowTraceEvent =
  | FlowTraceRouteEvent
  | FlowTraceDelegateEvent
  | FlowTraceToolCallEvent
  | FlowTraceThinkingEvent
  | FlowTraceTurnCompleteEvent;

interface FlowTraceEventBase {
  /** The conversation/run this event belongs to (canvas filters on it). */
  runId: string;
  /** Monotonic per-process sequence — ordering + dedupe across replays. */
  seq: number;
  /** Wall-clock stamp (ms epoch) when published. */
  ts: number;
}

/** Router picked a tier/path. Maps from `dispatcher.route`. */
export interface FlowTraceRouteEvent extends FlowTraceEventBase {
  kind: 'route';
  route: string;
  mechanism?: string;
  rationale?: string;
}

/** Dispatcher handed off to a specialist/team. Maps from `dispatcher.delegate`. */
export interface FlowTraceDelegateEvent extends FlowTraceEventBase {
  kind: 'delegate';
  /** Qualified target, e.g. `team.planner`. */
  target: string;
  args?: unknown;
}

/** A tool/function was invoked. Maps from `ax.function_call.*`. */
export interface FlowTraceToolCallEvent extends FlowTraceEventBase {
  kind: 'tool_call';
  name: string;
  qualifiedName?: string;
  args?: unknown;
}

/** Model reasoning surfaced for the step. */
export interface FlowTraceThinkingEvent extends FlowTraceEventBase {
  kind: 'thinking';
  text: string;
  stage?: string;
}

/** A turn finished. Maps from `dispatcher.turn` / `dispatcher.completed`. */
export interface FlowTraceTurnCompleteEvent extends FlowTraceEventBase {
  kind: 'turn_complete';
  turn?: number;
  stage?: string;
  latencySec?: number;
  output?: string;
  isError?: boolean;
}

/** Omit that distributes over the union so each variant keeps its own fields. */
type DistributiveOmit<T, K extends keyof FlowTraceEvent> = T extends unknown ? Omit<T, K> : never;

/** What a caller passes to `publish()` — `seq`/`ts` are stamped by the bus. */
export type FlowTraceEventInput = DistributiveOmit<FlowTraceEvent, 'seq' | 'ts'>;

export type FlowTraceSubscriber = (evt: FlowTraceEvent) => void;

export interface FlowTraceSubscribeOptions {
  /** Only deliver events for this run (also scopes the replayed buffer). */
  runId?: string;
  /** Replay the recent ring buffer on subscribe so a late canvas catches up. Default true. */
  replay?: boolean;
}

const BUFFER_MAX = 200;
const CHANNEL = 'flow-trace';

interface Bus {
  emitter: EventEmitter;
  buffer: FlowTraceEvent[];
  seq: number;
}

// Survive tsx-watch / hot reload by hanging the singleton off globalThis.
const g = globalThis as unknown as { __axFlowTraceBus?: Bus };
const bus: Bus = (g.__axFlowTraceBus ??= (() => {
  const emitter = new EventEmitter();
  // Many SSE subscribers may attach at once; lift the default 10-listener cap.
  emitter.setMaxListeners(0);
  return { emitter, buffer: [], seq: 0 };
})());

/** Publish an event; `seq` (ordering) and `ts` are stamped here. Never throws. */
export function publishFlowTrace(input: FlowTraceEventInput): FlowTraceEvent {
  const evt = { ...input, seq: ++bus.seq, ts: Date.now() } as FlowTraceEvent;
  bus.buffer.push(evt);
  if (bus.buffer.length > BUFFER_MAX) bus.buffer.splice(0, bus.buffer.length - BUFFER_MAX);
  bus.emitter.emit(CHANNEL, evt);
  return evt;
}

/**
 * Subscribe to the bus. Returns an unsubscribe fn. By default the recent ring
 * buffer (optionally scoped to `runId`) is replayed synchronously first so a
 * canvas opened mid-run catches up before the live tail.
 */
export function subscribeFlowTrace(
  subscriber: FlowTraceSubscriber,
  options: FlowTraceSubscribeOptions = {},
): () => void {
  const { runId, replay = true } = options;
  const guarded: FlowTraceSubscriber = (evt) => {
    if (runId && evt.runId !== runId) return;
    try {
      subscriber(evt);
    } catch {
      // a broken subscriber must never break publishing (or the chat turn)
    }
  };

  if (replay) {
    for (const evt of bus.buffer) guarded(evt);
  }

  bus.emitter.on(CHANNEL, guarded);
  return () => {
    bus.emitter.off(CHANNEL, guarded);
  };
}

/** Snapshot the recent ring buffer (optionally scoped to a run). */
export function getFlowTraceBuffer(runId?: string): FlowTraceEvent[] {
  return runId ? bus.buffer.filter((evt) => evt.runId === runId) : [...bus.buffer];
}

/** Mint a run id for a conversation that has no persisted run of its own. */
export function newFlowTraceRunId(): string {
  return randomUUID();
}
