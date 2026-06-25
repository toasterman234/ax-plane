'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import {
  applyDispatcherStreamEvent,
  DISPATCHER_FLOW_ENTRY,
  type NodeInlineDetail,
  type TraceOverlay,
} from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { api } from '@/lib/api';
import { streamAxEngineDispatcherRun } from '@/lib/ax-dispatcher-sse';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type RequestRow = { id: string; body: string; agentId: string };
type DispatcherStatus = { available: boolean; axServerUrl: string };

export default function DispatcherPage() {
  const [query, setQuery] = useState('');
  const [overlay, setOverlay] = useState<TraceOverlay | undefined>();
  const [details, setDetails] = useState<Record<string, NodeInlineDetail>>({});
  const [liveOutput, setLiveOutput] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [governedRunId, setGovernedRunId] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const liveOverlayRef = useRef<TraceOverlay>({});
  const liveDetailsRef = useRef<Record<string, NodeInlineDetail>>({});

  const status = useQuery({
    queryKey: ['ax-dispatcher-status'],
    queryFn: () => api<DispatcherStatus & { entry: typeof DISPATCHER_FLOW_ENTRY }>('/ax-dispatcher'),
    refetchInterval: 30_000,
  });

  const requests = useQuery({
    queryKey: ['requests'],
    queryFn: () => api<RequestRow[]>('/requests'),
  });

  const pushActivity = (line: string) => {
    setActivity((rows) => [...rows.slice(-40), line]);
  };

  const runLive = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    setGovernedRunId(null);
    setOverlay({});
    setDetails({});
    setActivity([]);
    liveOverlayRef.current = {};
    liveDetailsRef.current = {};
    setLiveOutput('');
    try {
      const result = await streamAxEngineDispatcherRun({
        query: q,
        onEvent: (event) => {
          applyDispatcherStreamEvent(liveOverlayRef.current, liveDetailsRef.current, event);
          setOverlay({ ...liveOverlayRef.current });
          setDetails({ ...liveDetailsRef.current });
          if ('delta' in event && event.delta) {
            setLiveOutput((prev) => (prev ?? '') + event.delta);
          }
          if ('error' in event) pushActivity(`error: ${event.error}`);
          else if ('delta' in event) return;
          else if (event.type === 'status') pushActivity(event.text);
          else if (event.type === 'route-decision') pushActivity(`route: ${event.route} (${event.mechanism ?? '—'})`);
          else if (event.type === 'tool-call') pushActivity(`delegate: ${event.qualifiedName ?? event.name}`);
          else if (event.type === 'turn') pushActivity(`turn ${event.stage ?? '?'} · ${event.latencySec?.toFixed(1) ?? '?'}s`);
        },
      });
      setLiveOutput(result.output);
      if (!result.ok) setError(result.error ?? 'Dispatcher failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live run failed');
    } finally {
      setRunning(false);
    }
  }, [query]);

  const queueGovernedRun = useCallback(async () => {
    if (!selectedRequestId) return;
    const q = query.trim();
    if (!q) return;
    setQueueing(true);
    setError(null);
    try {
      const run = await api<{ id: string }>('/runs', {
        method: 'POST',
        body: JSON.stringify({
          requestId: selectedRequestId,
          useDispatcher: true,
          dispatcherQuery: q,
        }),
      });
      setGovernedRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue governed run');
    } finally {
      setQueueing(false);
    }
  }, [query, selectedRequestId]);

  const available = status.data?.available ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ax dispatcher</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Proxied ax-server <code className="text-xs">/dispatcher</code> — dynamic RLM supervisor with{' '}
          <code className="text-xs">team.planner</code>, <code className="text-xs">team.coder</code>,{' '}
          <code className="text-xs">team.researcher</code> child agents. Governed runs use{' '}
          <code className="text-xs">runKind: axdispatcher</code>.
        </p>
        <p className="mt-2 text-sm">
          Engine:{' '}
          <span className={available ? 'text-emerald-400' : 'text-amber-400'}>
            {available ? 'dispatcher available' : 'unavailable'}
          </span>
          {status.data?.axServerUrl ? (
            <span className="ml-2 font-mono text-xs text-slate-500">{status.data.axServerUrl}</span>
          ) : null}
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-800 px-4 py-3">
          <h2 className="text-lg font-semibold">{DISPATCHER_FLOW_ENTRY.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{DISPATCHER_FLOW_ENTRY.summary}</p>
        </div>
        <div className="h-[420px] bg-slate-950">
          <FlowCanvas spec={DISPATCHER_FLOW_ENTRY.spec} overlay={overlay} details={details} />
        </div>
        {liveOutput !== null ? (
          <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-wide text-slate-500">Answer</p>
            <p className="mt-1 whitespace-pre-wrap">{liveOutput || '…'}</p>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Run dispatcher</h3>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          placeholder="Query for the dispatcher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={runLive} disabled={running || !query.trim() || !available}>
            {running ? 'Running…' : 'Run live (engine SSE)'}
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm text-slate-300">
            Governed AxPlane run
            <select
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={selectedRequestId}
              onChange={(e) => setSelectedRequestId(e.target.value)}
            >
              <option value="">Select a request</option>
              {(requests.data ?? []).map((request) => (
                <option key={request.id} value={request.id}>
                  {request.body.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={queueGovernedRun}
            disabled={queueing || !selectedRequestId || !query.trim() || !available}
          >
            {queueing ? 'Queueing…' : 'Queue governed run'}
          </Button>
        </div>
        {governedRunId ? (
          <p className="text-sm text-sky-400">
            Queued —{' '}
            <Link href={`/runs/${governedRunId}`} className="underline">
              open run
            </Link>
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </Card>

      {activity.length ? (
        <Card className="p-4">
          <h3 className="font-semibold">Live activity</h3>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto font-mono text-xs text-slate-400">
            {activity.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-slate-500">
        Graph child-runs: <Link href="/workflows" className="text-sky-400 hover:underline">Workflows</Link>. Ax{' '}
        <code>flow()</code>: <Link href="/ax-flows" className="text-sky-400 hover:underline">AX Flows</Link>.
      </p>
    </div>
  );
}
