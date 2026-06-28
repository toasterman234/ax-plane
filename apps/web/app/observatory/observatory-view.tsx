'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFlowTrace } from '@axplane/flow-canvas';
import { ConversationFlowCanvas, type FlowTraceReplayContext } from '@axplane/flow-canvas/components';
import DispatcherTabPage from '@/app/workflows/dispatcher/page';
import { Card } from '@/components/ui/card';
import { API_URL, api } from '@/lib/api';
import { ObservatoryRoutingEvalPanel } from './observatory-routing-eval-panel';
import { ObservatoryTracePanel } from './observatory-trace-panel';

type Tab = 'live' | 'topology';

type ReplaySession = {
  runId: string;
  caseId: string;
  prompt: string;
  expectFirst?: string | null;
  expectAny?: string[];
  status: 'running' | 'passed' | 'failed' | 'error';
  failureReason: string | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live conversation' },
  { id: 'topology', label: 'Team topology' },
];

export function ObservatoryView() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('live');
  const [runId, setRunId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [draftRunId, setDraftRunId] = useState('');
  const traceId = searchParams.get('traceId');

  useEffect(() => {
    const fromUrl = searchParams.get('runId');
    const fromCase = searchParams.get('caseId');
    if (fromUrl) {
      setRunId(fromUrl);
      setDraftRunId(fromUrl);
    }
    if (fromCase) setCaseId(fromCase);
  }, [searchParams]);

  const events = useFlowTrace(runId, { baseUrl: API_URL });

  const replaySession = useQuery({
    queryKey: ['flow-trace-replay', runId],
    queryFn: () => api<ReplaySession>(`/api/flow-trace/replays/${runId}`),
    enabled: Boolean(runId),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  });

  const replay: FlowTraceReplayContext | null = useMemo(() => {
    const s = replaySession.data;
    if (!s) return null;
    return {
      caseId: s.caseId,
      prompt: s.prompt,
      expectFirst: s.expectFirst,
      expectAny: s.expectAny,
      status: s.status,
      failureReason: s.failureReason,
    };
  }, [replaySession.data]);

  const onReplayStarted = useCallback((session: Pick<ReplaySession, 'runId' | 'caseId'>) => {
    setRunId(session.runId);
    setCaseId(session.caseId);
    setDraftRunId(session.runId);
  }, []);

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[600px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Observatory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live agent routing map + eval replay on one canvas.{' '}
          <Link href="/workflows/dispatcher" className="text-sky-400 hover:underline">
            Dispatcher cockpit
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ObservatoryRoutingEvalPanel activeRunId={runId} onReplayStarted={onReplayStarted} />

          {replaySession.data?.failureReason ? (
            <p className="text-sm text-red-400">{replaySession.data.failureReason}</p>
          ) : null}
          {replaySession.data?.status === 'passed' ? (
            <p className="text-sm text-emerald-400">Case {caseId ?? replaySession.data.caseId} passed</p>
          ) : null}

          <form
            className="flex shrink-0 flex-wrap items-center gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setRunId(draftRunId.trim() || null);
            }}
          >
            <label className="text-muted-foreground">Watch run</label>
            <input
              value={draftRunId}
              onChange={(e) => setDraftRunId(e.target.value)}
              placeholder="run id from replay or live chat"
              className="min-w-[18rem] flex-1 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
            >
              Watch
            </button>
            {runId ? (
              <span className="font-mono text-xs text-emerald-400">● {runId.slice(0, 8)}…</span>
            ) : (
              <span className="text-xs text-muted-foreground">pick a case above to replay</span>
            )}
          </form>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="flex min-h-[280px] flex-col overflow-hidden p-0 lg:min-h-0">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">
                  {replay ? `Replay · ${replay.caseId}` : 'Live conversation flow'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Green = path taken; dashed ghosts = expected delegates; amber/red = routing miss.
                </p>
              </div>
              <div className="flow-canvas-host min-h-[240px] flex-1 bg-card">
                <ConversationFlowCanvas runId={runId} events={events} replay={replay} baseUrl={API_URL} />
              </div>
            </Card>

            <Card className="min-h-0 overflow-auto p-3">
              <ObservatoryTracePanel events={events} traceId={traceId} />
            </Card>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <DispatcherTabPage />
        </div>
      )}
    </div>
  );
}
