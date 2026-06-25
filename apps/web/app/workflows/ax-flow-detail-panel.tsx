'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import type { FlowEntry } from '@axplane/flow-canvas';
import {
  applyAxFlowStreamEvent,
  deriveEngineRunOverlay,
  type AxEngineRunDetail,
  type AxEngineRunSummary,
  type NodeInlineDetail,
  type TraceOverlay,
} from '@axplane/flow-canvas';
import { FlowCanvas } from '@axplane/flow-canvas/components';
import { api } from '@/lib/api';
import { streamAxEngineFlowRun } from '@/lib/ax-flow-sse';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type RequestRow = { id: string; body: string; agentId: string };

export function AxFlowDetailPanel({ flow }: { flow: FlowEntry }) {
  const [flowInput, setFlowInput] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<TraceOverlay | undefined>();
  const [details, setDetails] = useState<Record<string, NodeInlineDetail>>({});
  const [liveOutput, setLiveOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [governedRunId, setGovernedRunId] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const liveOverlayRef = useRef<TraceOverlay>({});
  const liveDetailsRef = useRef<Record<string, NodeInlineDetail>>({});

  const runs = useQuery({
    queryKey: ['ax-flow-runs', flow.id],
    queryFn: () => api<{ runs: AxEngineRunSummary[] }>(`/ax-flows/${flow.id}/runs`),
    refetchInterval: running ? false : 15_000,
  });

  const requests = useQuery({
    queryKey: ['requests'],
    queryFn: () => api<RequestRow[]>('/requests'),
  });

  const paintEngineRun = useCallback(async (runId: string) => {
    setError(null);
    setSelectedRunId(runId);
    setLiveOutput(null);
    try {
      const detail = await api<AxEngineRunDetail>(`/ax-engine/runs/${runId}?flow=${encodeURIComponent(flow.id)}`);
      const painted = deriveEngineRunOverlay(detail);
      setOverlay(painted.overlay);
      setDetails(painted.details);
      setLiveOutput(detail.output ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load engine run');
    }
  }, [flow.id]);

  const runLive = useCallback(async () => {
    const input = flowInput.trim();
    if (!input) return;
    setRunning(true);
    setError(null);
    setSelectedRunId(null);
    setGovernedRunId(null);
    setOverlay({});
    setDetails({});
    liveOverlayRef.current = {};
    liveDetailsRef.current = {};
    setLiveOutput(null);
    try {
      const result = await streamAxEngineFlowRun({
        flowId: flow.id,
        input,
        onEvent: (event) => {
          applyAxFlowStreamEvent(liveOverlayRef.current, liveDetailsRef.current, event);
          setOverlay({ ...liveOverlayRef.current });
          setDetails({ ...liveDetailsRef.current });
        },
      });
      setLiveOutput(result.output);
      if (!result.ok) setError(result.error ?? 'Flow failed');
      void runs.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live run failed');
    } finally {
      setRunning(false);
    }
  }, [flow.id, flowInput, runs]);

  const queueGovernedRun = useCallback(async () => {
    if (!selectedRequestId) return;
    const input = flowInput.trim();
    if (!input) return;
    setQueueing(true);
    setError(null);
    try {
      const run = await api<{ id: string }>('/runs', {
        method: 'POST',
        body: JSON.stringify({
          requestId: selectedRequestId,
          axFlowId: flow.id,
          flowInput: input,
        }),
      });
      setGovernedRunId(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue governed run');
    } finally {
      setQueueing(false);
    }
  }, [flow.id, flowInput, selectedRequestId]);

  const clearOverlay = () => {
    setOverlay(undefined);
    setDetails({});
    setLiveOutput(null);
    setSelectedRunId(null);
  };

  const runList = runs.data?.runs ?? [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">{flow.title}</h2>
          <p className="font-mono text-xs text-muted-foreground">{flow.id}</p>
          {flow.summary ? <p className="mt-2 text-sm text-muted-foreground">{flow.summary}</p> : null}
        </div>
        <div className="h-[460px] bg-card">
          <FlowCanvas spec={flow.spec} overlay={overlay} details={details} />
        </div>
        {liveOutput ? (
          <div className="border-t border-border px-4 py-3 text-sm text-foreground">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Output</p>
            <p className="mt-1 whitespace-pre-wrap">{liveOutput}</p>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Run this flow</h3>
        <textarea
          className="min-h-[88px] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
          placeholder="Flow input…"
          value={flowInput}
          onChange={(e) => setFlowInput(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={runLive} disabled={running || !flowInput.trim()}>
            {running ? 'Running…' : 'Run live (engine SSE)'}
          </Button>
          <Button className="bg-secondary text-secondary-foreground hover:opacity-90" onClick={clearOverlay} disabled={!overlay}>
            Clear overlay
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm text-foreground">
            Governed AxPlane run (queued worker → ax-server)
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
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
          <Button onClick={queueGovernedRun} disabled={queueing || !selectedRequestId || !flowInput.trim()}>
            {queueing ? 'Queueing…' : 'Queue governed run'}
          </Button>
        </div>
        {governedRunId ? (
          <p className="text-sm text-emerald-400">
            Governed run queued:{' '}
            <Link href={`/runs/${governedRunId}`} className="underline hover:text-emerald-300">
              {governedRunId}
            </Link>
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">Engine run history</h3>
          <button
            type="button"
            className="text-xs text-sky-400 hover:underline"
            onClick={() => void runs.refetch()}
          >
            Refresh
          </button>
        </div>
        {runList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved runs for this flow yet.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {runList.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => void paintEngineRun(run.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedRunId === run.id ? 'border-sky-700 bg-sky-950/30' : 'border-border hover:border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={run.ok ? 'text-emerald-400' : 'text-red-400'}>{run.ok ? 'ok' : 'fail'}</span>
                    <span className="font-mono text-xs text-muted-foreground">{new Date(run.ts).toLocaleString()}</span>
                    {run.latencySec ? <span className="text-xs text-muted-foreground">{run.latencySec.toFixed(1)}s</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{run.input}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
