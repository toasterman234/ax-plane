'use client';

import { useEffect, useState } from 'react';
import { API_URL, api } from '@/lib/api';
import type { RunEvent } from '@/app/runs/[id]/run-detail-derive';

type RunRow = {
  id: string;
  status: string;
  agentId?: string;
  runKind?: string;
  inputJson?: unknown;
  outputJson?: unknown;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RunResponse = {
  run: RunRow;
  events: RunEvent[];
  children?: RunRow[];
};

const RUN_REFRESH_TYPES = new Set([
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.status',
  'graph.completed',
  'graph.step.completed',
  'graph.step.started',
  'graph.failed',
  'axflow.step.started',
  'axflow.step.completed',
  'axflow.completed',
  'axflow.failed',
  'dispatcher.delegate',
  'dispatcher.turn',
  'dispatcher.guard',
  'dispatcher.completed',
  'dispatcher.failed',
  'approval.created',
  'approval.approved',
  'approval.rejected',
]);

export function useRunStream(runId: string | undefined) {
  const [run, setRun] = useState<RunRow | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [children, setChildren] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(Boolean(runId));
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setEvents([]);
      setChildren([]);
      setLoading(false);
      setStreamConnected(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void api<RunResponse>(`/runs/${runId}`)
      .then((data) => {
        if (cancelled) return;
        setRun(data.run);
        setEvents(data.events);
        setChildren(data.children ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const source = new EventSource(`${API_URL}/runs/${runId}/stream`);

    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) => (
        current.some((row) => row.id === event.id)
          ? current
          : [...current, event].sort((a, b) => a.seq - b.seq)
      ));

      if (RUN_REFRESH_TYPES.has(event.type)) {
        void api<RunResponse>(`/runs/${runId}`)
          .then((data) => {
            if (cancelled) return;
            setRun(data.run);
            setChildren(data.children ?? []);
          })
          .catch(() => undefined);
      }
    };

    return () => {
      cancelled = true;
      source.close();
      setStreamConnected(false);
    };
  }, [runId]);

  return { run, events, children, loading, streamConnected };
}
