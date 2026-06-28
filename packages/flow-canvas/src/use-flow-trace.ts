import { useEffect, useState } from 'react';
import type { FlowTraceEvent } from '@axplane/flow-trace-bus';

export interface UseFlowTraceOptions {
  /**
   * Base URL of the AxPlane API (where `/api/flow-trace/stream` lives). Defaults
   * to '' (same origin) — set it to e.g. `http://localhost:8797` when the web
   * app and API are served from different ports.
   */
  baseUrl?: string;
}

/**
 * Observatory Slice A (A3) — subscribe to the live flow-trace SSE feed for one
 * run and return its events in `seq` order. Re-renders as events arrive.
 *
 * Passing a falsy `runId` yields an empty list and opens no connection, so the
 * hook is safe to call before a run exists.
 */
export function useFlowTrace(
  runId: string | null | undefined,
  options: UseFlowTraceOptions = {},
): FlowTraceEvent[] {
  const { baseUrl = '' } = options;
  const [events, setEvents] = useState<FlowTraceEvent[]>([]);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      return;
    }
    // Reset whenever we switch runs.
    setEvents([]);

    const url = `${baseUrl}/api/flow-trace/stream?runId=${encodeURIComponent(runId)}`;
    const source = new EventSource(url);

    source.onmessage = (message: MessageEvent<string>) => {
      let evt: FlowTraceEvent;
      try {
        evt = JSON.parse(message.data) as FlowTraceEvent;
      } catch {
        return;
      }
      setEvents((prev) => {
        if (prev.some((existing) => existing.seq === evt.seq)) return prev;
        const next = [...prev, evt];
        next.sort((a, b) => a.seq - b.seq);
        return next;
      });
    };

    return () => {
      source.close();
    };
  }, [runId, baseUrl]);

  return events;
}
