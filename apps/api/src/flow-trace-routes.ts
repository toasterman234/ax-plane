import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  subscribeFlowTrace,
  type FlowTraceEvent,
} from '@axplane/flow-trace-bus';
import { loadDispatcherCaseSummaries } from './dispatcher-routing-cases.js';
import { getReplaySession, listReplaySessions, replayTrace } from './flow-trace-replay.js';

/**
 * Observatory Slice A — SSE feed of the live flow-trace bus.
 *
 * `GET /api/flow-trace/stream[?runId=...]` streams `FlowTraceEvent`s as they are
 * published. With `runId` the feed (and its replayed catch-up buffer) is scoped
 * to one conversation; without it, every run is streamed. Matches the existing
 * `streamSSE` style used by `/runs/:id/stream`.
 */
export function registerFlowTraceRoutes(app: Hono) {
  app.get('/api/flow-trace/cases', async (c) => {
    try {
      return c.json(await loadDispatcherCaseSummaries());
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        503,
      );
    }
  });

  app.get('/api/flow-trace/replays', (c) => {
    const limit = Number(c.req.query('limit') ?? 20);
    return c.json(listReplaySessions(Number.isFinite(limit) ? limit : 20));
  });

  app.get('/api/flow-trace/replays/:runId', (c) => {
    const session = getReplaySession(c.req.param('runId'));
    if (!session) return c.json({ error: 'Not found' }, 404);
    return c.json(session);
  });

  const ReplayBodySchema = z.object({
    caseId: z.string().min(1),
    includeSlow: z.boolean().optional(),
  });

  app.post('/api/flow-trace/replay', async (c) => {
    const body = ReplayBodySchema.parse(await c.req.json());
    try {
      const session = await replayTrace(body);
      return c.json(session, 202);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('Unknown') ? 404 : msg.includes('already replaying') ? 409 : 503;
      return c.json({ error: msg }, status);
    }
  });

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
