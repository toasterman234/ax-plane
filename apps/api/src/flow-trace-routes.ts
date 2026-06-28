import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  subscribeFlowTrace,
  type FlowTraceEvent,
} from '@axplane/flow-trace-bus';

/**
 * Observatory Slice A — SSE feed of the live flow-trace bus.
 *
 * `GET /api/flow-trace/stream[?runId=...]` streams `FlowTraceEvent`s as they are
 * published. With `runId` the feed (and its replayed catch-up buffer) is scoped
 * to one conversation; without it, every run is streamed. Matches the existing
 * `streamSSE` style used by `/runs/:id/stream`.
 */
export function registerFlowTraceRoutes(app: Hono) {
  app.get('/api/flow-trace/stream', (c) => {
    const runId = c.req.query('runId') || undefined;
    return streamSSE(c, async (stream) => {
      const queue: FlowTraceEvent[] = [];
      let wake: (() => void) | null = null;
      let closed = false;

      // `subscribeFlowTrace` replays the recent buffer synchronously (scoped to
      // runId) before the live tail, so a canvas opened mid-run catches up.
      const unsubscribe = subscribeFlowTrace(
        (evt) => {
          queue.push(evt);
          wake?.();
        },
        { runId, replay: true },
      );

      stream.onAbort(() => {
        closed = true;
        unsubscribe();
        wake?.();
      });

      try {
        while (!closed) {
          while (queue.length > 0 && !closed) {
            const evt = queue.shift()!;
            await stream.writeSSE({ id: String(evt.seq), data: JSON.stringify(evt) });
          }
          if (closed) break;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = null;
        }
      } finally {
        unsubscribe();
      }
    });
  });
}
