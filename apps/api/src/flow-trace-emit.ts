import {
  newFlowTraceRunId,
  publishFlowTrace,
  type FlowTraceEventInput,
} from '@axplane/flow-trace-bus';
import {
  parseDispatcherSsePayload,
  type DispatcherStreamEvent,
} from '@axplane/flow-canvas';

/**
 * Observatory Slice A (A2) — emit `FlowTraceEvent`s from a live dispatcher chat
 * stream onto the flow-trace bus, per the contract table:
 *
 *   dispatcher.route     (route-decision) -> route
 *   dispatcher.delegate  (tool-call team.*) -> delegate
 *   ax.function_call.*   (tool-call)       -> tool_call
 *   dispatcher.turn      (turn)            -> turn_complete
 *   (model reasoning)    (thought)         -> thinking
 *
 * The ax-server `/dispatcher?stream=1` SSE payloads (`DispatcherStreamEvent`)
 * are the wire form of those control events; we map them here. This lives in a
 * small standalone module so the chat handler only has to wrap the stream once
 * (one line in server.ts) rather than grow new parsing logic.
 */

/** Map one dispatcher SSE event to a bus event, or null if it isn't drawable. */
export function dispatcherEventToFlowTrace(
  runId: string,
  event: DispatcherStreamEvent,
): FlowTraceEventInput | null {
  if (!('type' in event)) return null; // delta / error frames carry no node fact

  switch (event.type) {
    case 'route-decision':
      return {
        runId,
        kind: 'route',
        route: event.route,
        mechanism: event.mechanism,
        rationale: event.rationale,
      };
    case 'thought':
      return { runId, kind: 'thinking', text: event.text };
    case 'turn':
      return {
        runId,
        kind: 'turn_complete',
        turn: event.turn,
        stage: event.stage,
        latencySec: event.latencySec,
        output: event.modelOutput ?? event.output,
        isError: event.isError,
      };
    case 'tool-call': {
      const name = event.qualifiedName ?? event.name ?? 'tool';
      // A `team.*` tool call IS a delegation; everything else is a plain tool.
      if (name.startsWith('team.')) {
        return { runId, kind: 'delegate', target: name, args: event.args };
      }
      return {
        runId,
        kind: 'tool_call',
        name,
        qualifiedName: event.qualifiedName,
        args: event.args,
      };
    }
    default:
      return null;
  }
}

/**
 * Wrap a dispatcher SSE byte stream: forward every byte UNCHANGED (chat is
 * unaffected) while parsing each `data:` frame and publishing the mapped
 * `FlowTraceEvent` to the bus. Publishing is fire-and-forget; a parse/publish
 * error can never break the passthrough.
 *
 * @param upstream the (already guard-wrapped) dispatcher response body
 * @param runId    conversation id to tag events with (minted if omitted)
 */
export function createFlowTraceTap(
  upstream: ReadableStream<Uint8Array>,
  runId: string = newFlowTraceRunId(),
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = (flush = false) => {
    // SSE frames are separated by a blank line.
    while (buffer.includes('\n\n')) {
      const split = buffer.split('\n\n');
      buffer = split.pop() ?? '';
      for (const frame of split) emitFrame(frame, runId);
    }
    if (flush && buffer.trim()) {
      emitFrame(buffer, runId);
      buffer = '';
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        try {
          buffer += decoder.decode();
          drain(true);
        } catch {
          /* never break the stream on a trace error */
        }
        controller.close();
        return;
      }
      controller.enqueue(value); // passthrough first — chat must never wait on us
      try {
        buffer += decoder.decode(value, { stream: true });
        drain();
      } catch {
        /* swallow */
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
    },
  });
}

function emitFrame(frame: string, runId: string): void {
  const line = frame.split('\n').find((row) => row.startsWith('data:'));
  if (!line) return;
  const raw = line.slice(5).trim();
  const event = parseDispatcherSsePayload(raw);
  if (!event) return;
  const mapped = dispatcherEventToFlowTrace(runId, event);
  if (mapped) publishFlowTrace(mapped);
}
