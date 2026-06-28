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
import { ObservatoryEvalPanel } from './observatory-eval-panel';
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
  const [showTracePanel, setShowTracePanel] = useState(false);
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

  const statusLine = replaySession.data?.failureReason ? (
    <span className="text-red-400">{replaySession.data.failureReason}</span>
  ) : replaySession.data?.status === 'passed' ? (
    <span className="text-emerald-400">Case {caseId ?? replaySession.data.caseId} passed</span>
  ) : replaySession.data?.status === 'running' ? (
    <span className="text-sky-400">Replay running…</span>
  ) : null;

  return (
    <div className="flex h-[calc(100vh-4.5rem)] min-h-[640px] flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Observatory</h1>
          <p className="text-sm text-muted-foreground">
            Routing map + eval replay.{' '}
            <Link href="/workflows/dispatcher" className="text-sky-400 hover:underline">
              Dispatcher
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'live' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <details className="shrink-0 rounded-md border border-border bg-card/40 px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
              Routing eval cases — pick a case to replay
            </summary>
            <div className="mt-2">
              <ObservatoryRoutingEvalPanel activeRunId={runId} onReplayStarted={onReplayStarted} />
            </div>
          </details>

          <div
            className={`grid min-h-0 flex-1 gap-3 ${showTracePanel ? 'lg:grid-cols-[1fr_280px]' : 'grid-cols-1'}`}
          >
            <Card className="flex min-h-0 flex-col overflow-hidden p-0">
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">
                    {replay ? `Replay · ${replay.caseId}` : 'Conversation flow'}
                  </h2>
                  {statusLine ? <p className="mt-0.5 text-xs">{statusLine}</p> : null}
                </div>
                <form
                  className="flex flex-wrap items-center gap-2 text-xs"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setRunId(draftRunId.trim() || null);
                  }}
                >
                  <input
                    value={draftRunId}
                    onChange={(e) => setDraftRunId(e.target.value)}
                    placeholder="run id"
                    className="w-44 rounded-md border border-border bg-card px-2 py-1 font-mono sm:w-52"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground"
                  >
                    Watch
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setShowTracePanel((v) => !v)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showTracePanel ? 'Hide reasoning' : 'Show reasoning'}
                </button>
              </div>
              <div className="observatory-canvas-host min-h-0 flex-1 bg-card">
                <ConversationFlowCanvas runId={runId} events={events} replay={replay} baseUrl={API_URL} />
              </div>
            </Card>

            {showTracePanel ? (
              <Card className="min-h-0 overflow-auto p-3 lg:max-h-none">
                <ObservatoryTracePanel events={events} traceId={traceId} />
              </Card>
            ) : null}
          </div>

          <details className="shrink-0 rounded-md border border-border bg-card/40 px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
              Eval Lab heatmap — suite pass/fail matrix (Slice D)
            </summary>
            <div className="mt-2">
              <ObservatoryEvalPanel />
            </div>
          </details>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <DispatcherTabPage />
        </div>
      )}
    </div>
  );
}
