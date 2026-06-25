'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_URL, api } from '@/lib/api';
import { Card } from '@/components/ui/card';

type Run = { id: string; status: string; inputJson: unknown; outputJson?: unknown; error?: string };
type RunEvent = { id: string; runId: string; seq: number; type: string; payloadJson: unknown; createdAt: string };

type RunResponse = { run: Run; events: RunEvent[] };

export function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    api<RunResponse>(`/runs/${runId}`).then((data) => {
      setRun(data.run);
      setEvents(data.events);
    });
  }, [runId]);

  useEffect(() => {
    const source = new EventSource(`${API_URL}/runs/${runId}/stream`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) => current.some((e) => e.id === event.id) ? current : [...current, event].sort((a, b) => a.seq - b.seq));
      if (['run.completed', 'run.failed', 'run.cancelled', 'run.status'].includes(event.type)) {
        api<RunResponse>(`/runs/${runId}`).then((data) => setRun(data.run)).catch(() => undefined);
      }
    };
    return () => source.close();
  }, [runId]);

  const latestStatus = useMemo(() => run?.status ?? 'loading', [run]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Run timeline</h1>
        <p className="font-mono text-sm text-slate-500">{runId}</p>
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <div>Status</div>
          <div className="rounded-full border border-slate-700 px-3 py-1 text-sm">{latestStatus}</div>
        </div>
        {run?.error ? <p className="mt-3 text-red-300">{run.error}</p> : null}
        {run?.outputJson ? <pre className="mt-3 rounded-md bg-slate-900 p-3 text-xs">{JSON.stringify(run.outputJson, null, 2)}</pre> : null}
      </Card>
      <div className="space-y-3">
        {events.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: RunEvent }) {
  const badge = event.type.startsWith('ax.function_call') ? 'border-amber-600 text-amber-200'
    : event.type.startsWith('approval') ? 'border-sky-600 text-sky-200'
    : event.type.startsWith('run.failed') ? 'border-red-600 text-red-200'
    : 'border-slate-700 text-slate-200';

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500">#{event.seq}</span>
          <span className={`rounded-full border px-2 py-1 text-xs ${badge}`}>{event.type}</span>
        </div>
        <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleTimeString()}</span>
      </div>
      <pre className="mt-3 rounded-md bg-slate-900 p-3 text-xs text-slate-300">{JSON.stringify(event.payloadJson, null, 2)}</pre>
    </Card>
  );
}
