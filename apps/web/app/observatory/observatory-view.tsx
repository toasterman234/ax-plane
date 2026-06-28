'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFlowTrace } from '@axplane/flow-canvas';
import { ConversationFlowCanvas } from '@axplane/flow-canvas/components';
import DispatcherTabPage from '@/app/workflows/dispatcher/page';
import { Card } from '@/components/ui/card';
import { API_URL } from '@/lib/api';
import { ObservatoryTracePanel } from './observatory-trace-panel';

type Tab = 'live' | 'topology';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live conversation' },
  { id: 'topology', label: 'Team topology' },
];

/**
 * Observatory (Slice B2/B3) — the cockpit that retires AX Studio.
 *
 * • Live conversation → the ported `ConversationFlowCanvas` (router-tier map with
 *   dimmed branches + per-turn stacking) wired to the Slice-A flow-trace bus via
 *   `useFlowTrace`, plus a right panel (reasoning + inline Langfuse).
 * • Team topology     → the existing `/workflows/dispatcher` view, reused intact
 *   as the secondary tab (the source route is untouched).
 */
export function ObservatoryView() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('live');

  // The run to paint. Until Slice C wires the chat to publish + share its runId,
  // the page seeds it from `?runId=` (and lets you set one to watch a live run).
  const [runId, setRunId] = useState<string | null>(null);
  const [draftRunId, setDraftRunId] = useState('');
  const traceId = searchParams.get('traceId');

  useEffect(() => {
    const fromUrl = searchParams.get('runId');
    if (fromUrl) {
      setRunId(fromUrl);
      setDraftRunId(fromUrl);
    }
  }, [searchParams]);

  // One subscription, shared by the canvas and the reasoning/trace panel.
  const events = useFlowTrace(runId, { baseUrl: API_URL });

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[600px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Observatory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One cockpit for live agent activity — routing, delegation, tool calls and thinking on a
          single map, with Langfuse one click away.{' '}
          <Link href="/workflows/dispatcher" className="text-sky-400 hover:underline">
            Full dispatcher cockpit
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
              placeholder="run id (Slice C will auto-attach the live run)"
              className="min-w-[18rem] flex-1 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
            >
              Watch
            </button>
            {runId ? (
              <span className="font-mono text-xs text-emerald-400">● {runId}</span>
            ) : (
              <span className="text-xs text-muted-foreground">no run attached</span>
            )}
          </form>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="flex min-h-[280px] flex-col overflow-hidden p-0 lg:min-h-0">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold">Live conversation flow</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Router-tier map — the branch this message takes lights up; skipped paths dim.
                </p>
              </div>
              <div className="flow-canvas-host min-h-[240px] flex-1 bg-card">
                <ConversationFlowCanvas events={events} />
              </div>
            </Card>

            <Card className="min-h-0 overflow-auto p-3">
              <ObservatoryTracePanel events={events} traceId={traceId} />
            </Card>
          </div>
        </div>
      ) : (
        // B3: reuse the existing dispatcher team-topology view intact. Importing
        // the route's component keeps `/workflows/dispatcher` untouched.
        <div className="min-h-0 flex-1 overflow-auto">
          <DispatcherTabPage />
        </div>
      )}
    </div>
  );
}
